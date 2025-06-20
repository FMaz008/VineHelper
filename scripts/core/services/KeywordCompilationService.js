/**
 * KeywordCompilationService - DI-based service for shared keyword compilation
 *
 * This service handles keyword compilation once and shares the results across
 * all browser extension contexts (service worker, content scripts, main page).
 * It uses serialization to share compiled regex patterns via message passing
 * or storage, avoiding duplicate compilation and memory usage.
 */

import { precompileKeywords, compileKeyword } from "../utils/KeywordMatch.js";
import { hasEtvCondition, fnv1aHash } from "../utils/KeywordUtils.js";

export class KeywordCompilationService {
	#storage;
	#logger;
	#runtimeAdapter;
	#compiledCache = new Map();
	#storageKey = "vh_compiled_keywords";
	#cacheVersion = "1.0.0"; // Increment when compilation logic changes

	constructor(storage, logger, runtimeAdapter) {
		this.#storage = storage;
		this.#logger = logger;
		this.#runtimeAdapter = runtimeAdapter;
	}

	/**
	 * Initialize the service and load any cached compiled keywords
	 */
	async initialize() {
		try {
			const cached = await this.#storage.get(this.#storageKey);
			if (cached && cached.version === this.#cacheVersion) {
				// Deserialize the cached data
				for (const [key, serializedData] of Object.entries(cached.compilations)) {
					const deserialized = this.#deserializeCompilation(serializedData);
					if (deserialized) {
						this.#compiledCache.set(key, deserialized);
					}
				}
				this.#logger.add(`KeywordCompilationService: Loaded ${this.#compiledCache.size} cached compilations`);
			}
		} catch (error) {
			this.#logger.add(`KeywordCompilationService: Failed to load cache: ${error.message}`);
		}

		// Listen for compilation requests from other contexts
		this.#setupMessageHandlers();
	}

	/**
	 * Compile keywords and share the results across contexts
	 * @param {string} type - The keyword type (highlight, hide, blur)
	 * @param {Array} keywords - The keywords array to compile
	 * @returns {Object} Compilation stats
	 */
	async compileAndShare(type, keywords) {
		const cacheKey = this.#getCacheKey(type, keywords);

		// Check if we already have this compilation
		if (this.#compiledCache.has(cacheKey)) {
			const cached = this.#compiledCache.get(cacheKey);
			return {
				total: keywords.length,
				compiled: cached.compiledCount,
				failed: cached.failedCount,
				cached: true,
			};
		}

		// Compile the keywords
		const stats = precompileKeywords(keywords);

		// Get the compiled cache from WeakMap (internal to KeywordMatch)
		// We need to serialize this for sharing
		const serialized = this.#serializeCompilation(keywords, stats);

		// Store in our cache
		this.#compiledCache.set(cacheKey, {
			keywords,
			serialized,
			compiledCount: stats.compiled,
			failedCount: stats.failed,
			timestamp: Date.now(),
		});

		// Share with other contexts
		await this.#shareCompilation(type, keywords, serialized);

		// Persist to storage
		await this.#persistCache();

		return stats;
	}

	/**
	 * Get compiled keywords for a specific type
	 * @param {string} type - The keyword type
	 * @param {Array} keywords - The keywords array
	 * @returns {Map|null} The compiled keyword map or null if not found
	 */
	async getCompiled(type, keywords) {
		const cacheKey = this.#getCacheKey(type, keywords);

		// Check local cache first
		if (this.#compiledCache.has(cacheKey)) {
			const cached = this.#compiledCache.get(cacheKey);
			return this.#deserializeCompilation(cached.serialized);
		}

		// Request from service worker if we're in a content script
		if (!chrome.runtime.getBackgroundPage) {
			try {
				const response = await this.#runtimeAdapter.sendMessage({
					action: "getCompiledKeywords",
					type,
					keywords,
				});

				if (response && response.compiled) {
					// Cache locally
					this.#compiledCache.set(cacheKey, {
						keywords,
						serialized: response.compiled,
						compiledCount: response.compiledCount,
						failedCount: response.failedCount,
						timestamp: Date.now(),
					});

					return this.#deserializeCompilation(response.compiled);
				}
			} catch (error) {
				this.#logger.add(`KeywordCompilationService: Failed to get compiled keywords: ${error.message}`);
			}
		}

		return null;
	}

	/**
	 * Clear all cached compilations
	 */
	async clearCache() {
		this.#compiledCache.clear();
		await this.#storage.remove(this.#storageKey);

		// Notify other contexts
		await this.#runtimeAdapter.sendMessage({
			action: "clearKeywordCache",
		});
	}

	/**
	 * Serialize compiled keywords for storage/sharing
	 * @private
	 */
	#serializeCompilation(keywords, stats) {
		const serialized = [];

		keywords.forEach((keyword, index) => {
			const compiled = compileKeyword(keyword);
			if (compiled) {
				// Convert regex to string patterns
				const entry = {
					index,
					keyword: typeof keyword === "string" ? keyword : keyword.contains,
					pattern: compiled.regex.source,
					flags: compiled.regex.flags,
				};

				if (compiled.withoutRegex) {
					entry.withoutPattern = compiled.withoutRegex.source;
					entry.withoutFlags = compiled.withoutRegex.flags;
				}

				// Include ETV conditions if present
				if (typeof keyword === "object") {
					if (keyword.etv_min) entry.etv_min = keyword.etv_min;
					if (keyword.etv_max) entry.etv_max = keyword.etv_max;
					entry.hasEtvCondition = hasEtvCondition(keyword);
				}

				serialized.push(entry);
			}
		});

		return serialized;
	}

	/**
	 * Deserialize compiled keywords from storage
	 * @private
	 */
	#deserializeCompilation(serialized) {
		if (!Array.isArray(serialized)) return null;

		const map = new Map();

		serialized.forEach((entry) => {
			try {
				const compiled = {
					regex: new RegExp(entry.pattern, entry.flags),
					withoutRegex: entry.withoutPattern ? new RegExp(entry.withoutPattern, entry.withoutFlags) : null,
				};

				// Add ETV condition flag if present
				if (entry.hasEtvCondition !== undefined) {
					compiled.hasEtvCondition = entry.hasEtvCondition;
				}

				map.set(entry.index, compiled);
			} catch (error) {
				this.#logger.add(`KeywordCompilationService: Failed to deserialize regex: ${error.message}`);
			}
		});

		return map;
	}

	/**
	 * Get a unique cache key for a keyword set
	 * @private
	 */
	#getCacheKey(type, keywords) {
		// For better performance with large arrays, build string manually
		// This avoids the overhead of JSON.stringify
		let keywordStr = "";

		for (let i = 0; i < keywords.length; i++) {
			const kw = keywords[i];
			// Include all properties that affect compilation
			keywordStr += kw.word || "";
			keywordStr += "|" + (kw.without || "");
			keywordStr += "|" + (kw.etv_min || "");
			keywordStr += "|" + (kw.etv_max || "");
			keywordStr += "|" + (kw.disabled ? "1" : "0");
			keywordStr += "\n"; // Separator between keywords
		}

		// Use FNV-1a hash for better distribution
		const hash = fnv1aHash(keywordStr);

		// Return base36 for shorter keys
		return `${type}_${hash.toString(36)}`;
	}

	/**
	 * Share compilation with other contexts
	 * @private
	 */
	async #shareCompilation(type, keywords, serialized) {
		try {
			await this.#runtimeAdapter.sendMessage({
				action: "shareCompiledKeywords",
				type,
				keywords,
				compiled: serialized,
			});
		} catch (error) {
			// This is expected if we're in the service worker
			this.#logger.add(`KeywordCompilationService: Could not share compilation: ${error.message}`);
		}
	}

	/**
	 * Persist cache to storage
	 * @private
	 */
	async #persistCache() {
		try {
			const toStore = {
				version: this.#cacheVersion,
				compilations: {},
			};

			for (const [key, data] of this.#compiledCache) {
				toStore.compilations[key] = data.serialized;
			}

			await this.#storage.set(this.#storageKey, toStore);
		} catch (error) {
			this.#logger.add(`KeywordCompilationService: Failed to persist cache: ${error.message}`);
		}
	}

	/**
	 * Setup message handlers for cross-context communication
	 * @private
	 */
	#setupMessageHandlers() {
		this.#runtimeAdapter.onMessage((message, sender, sendResponse) => {
			if (message.action === "getCompiledKeywords") {
				const cacheKey = this.#getCacheKey(message.type, message.keywords);
				const cached = this.#compiledCache.get(cacheKey);

				if (cached) {
					sendResponse({
						compiled: cached.serialized,
						compiledCount: cached.compiledCount,
						failedCount: cached.failedCount,
					});
				} else {
					sendResponse(null);
				}
				return true; // Will respond asynchronously
			}

			if (message.action === "shareCompiledKeywords") {
				const cacheKey = this.#getCacheKey(message.type, message.keywords);
				this.#compiledCache.set(cacheKey, {
					keywords: message.keywords,
					serialized: message.compiled,
					compiledCount: message.compiled.length,
					failedCount: message.keywords.length - message.compiled.length,
					timestamp: Date.now(),
				});
			}

			if (message.action === "clearKeywordCache") {
				this.#compiledCache.clear();
			}
		});
	}
}

/**
 * Register the service with the DI container
 */
export function registerKeywordCompilationService(container) {
	container.register(
		"keywordCompilationService",
		(storage, logger, runtimeAdapter) => {
			const service = new KeywordCompilationService(storage, logger, runtimeAdapter);
			// Auto-initialize when created
			service.initialize().catch((error) => {
				logger.add(`Failed to initialize KeywordCompilationService: ${error.message}`);
			});
			return service;
		},
		{
			dependencies: ["storage", "logger", "runtimeAdapter"],
			singleton: true,
		}
	);
}
