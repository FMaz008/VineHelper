import { hasEtvCondition, areEtvConditionsSatisfied } from "./KeywordUtils.js";

// Pre-compiled regex cache for keywords
// Using a Map with string keys (JSON stringified) to avoid memory leaks
// WeakMap was causing issues because Settings.get() returns new array references
const compiledKeywordCache = new Map();
const MAX_CACHE_SIZE = 10; // Limit cache size to prevent unbounded growth

// Cache for settings arrays to avoid repeated JSON.stringify
let settingsArrayCache = new WeakMap();
let cacheKeyCounter = 0;

// Generate a cache key from keywords array
function getCacheKey(keywords) {
	// Check if we already have a cache key for this array reference
	if (settingsArrayCache.has(keywords)) {
		return settingsArrayCache.get(keywords);
	}

	// Generate a simple unique key instead of expensive JSON.stringify
	const key = `keywords_${++cacheKeyCounter}`;
	settingsArrayCache.set(keywords, key);

	return key;
}

// Clean up old cache entries when size limit is reached
function cleanupCache() {
	if (compiledKeywordCache.size <= MAX_CACHE_SIZE) {
		return;
	}

	// Remove oldest entries (first half of the cache)
	const entriesToRemove = Math.floor(compiledKeywordCache.size / 2);
	const keys = Array.from(compiledKeywordCache.keys());

	for (let i = 0; i < entriesToRemove; i++) {
		compiledKeywordCache.delete(keys[i]);
	}

	console.log(`[KeywordMatch] Cache cleanup: removed ${entriesToRemove} old entries`);
}

/**
 * Creates a regex pattern for keyword matching
 * @param {string} keyword - The keyword to create a pattern for
 * @returns {string} The regex pattern
 */
function createRegexPattern(keyword) {
	// ASCII characters use word boundaries, non-ASCII uses Unicode property escapes
	return /^[\x20-\x7E]+$/.test(keyword) ? `\\b${keyword}\\b` : `(?<![\\p{L}\\p{N}])${keyword}(?![\\p{L}\\p{N}])`;
}

/**
 * Compiles a keyword into regex object(s)
 * @param {string|object} word - The keyword (string or object format)
 * @returns {object|null} Compiled regex object or null if compilation failed
 */
function compileKeyword(word) {
	try {
		if (typeof word === "string") {
			// Old data format where each keyword was a string
			const pattern = createRegexPattern(word);
			return {
				regex: new RegExp(pattern, "iu"),
				withoutRegex: null,
			};
		} else if (typeof word === "object" && word.contains) {
			// New data format where keywords are objects
			const containsPattern = createRegexPattern(word.contains);
			const containsRegex = new RegExp(containsPattern, "iu");

			let withoutRegex = null;
			if (word.without) {
				const withoutPattern = createRegexPattern(word.without);
				withoutRegex = new RegExp(withoutPattern, "iu");
			}

			const compiled = {
				regex: containsRegex,
				withoutRegex: withoutRegex,
			};

			// Add ETV condition flag
			if (hasEtvCondition(word)) {
				compiled.hasEtvCondition = true;
			}

			return compiled;
		}
	} catch (error) {
		if (error instanceof SyntaxError) {
			const keywordStr = typeof word === "string" ? word : word.contains;
			console.warn(`[KeywordMatch] Failed to compile regex for keyword: "${keywordStr}" - ${error.message}`);
		}
	}
	return null;
}

/**
 * Pre-compiles regex patterns for all keywords
 * Should be called when keywords are loaded from settings
 */
function precompileKeywords(keywords) {
	const cacheKey = getCacheKey(keywords);

	// Check if already compiled
	if (compiledKeywordCache.has(cacheKey)) {
		const existingCache = compiledKeywordCache.get(cacheKey);
		return {
			total: keywords.length,
			compiled: existingCache.size,
			failed: keywords.length - existingCache.size,
			cached: true,
		};
	}

	// Clean up cache if it's getting too large
	cleanupCache();

	// Create a new cache for this keywords array
	const cache = new Map();
	let failedCount = 0;

	keywords.forEach((word, index) => {
		const compiled = compileKeyword(word);
		if (compiled) {
			cache.set(index, compiled);
		} else {
			failedCount++;
		}
	});

	// Store the cache for this keywords array
	compiledKeywordCache.set(cacheKey, cache);

	// Return stats for logging by caller
	return {
		total: keywords.length,
		compiled: cache.size,
		failed: failedCount,
		cached: false,
	};
}

/**
 * Get compiled regex for a keyword at a specific index
 */
function getCompiledRegex(keywords, index) {
	const cacheKey = getCacheKey(keywords);
	const cache = compiledKeywordCache.get(cacheKey);
	if (!cache) {
		if (typeof window !== "undefined" && window.DEBUG_KEYWORD_CACHE) {
			console.log(`[KeywordMatch] Cache miss for key: ${cacheKey}`);
		}
		return null;
	}
	if (typeof window !== "undefined" && window.DEBUG_KEYWORD_CACHE) {
		console.log(`[KeywordMatch] Cache hit for key: ${cacheKey}`);
	}
	return cache.get(index);
}

/**
 * Tests if a keyword matches the title with ETV filtering
 * @param {object} word - The keyword object
 * @param {object} compiled - The compiled regex object
 * @param {string} title - The title to test
 * @param {*} etv_min - Minimum ETV value
 * @param {*} etv_max - Maximum ETV value
 * @returns {boolean} True if matches
 */
function testKeywordMatch(word, compiled, title, etv_min, etv_max) {
	// Test the main regex
	if (!compiled.regex.test(title)) {
		return false;
	}

	// For string keywords, we're done
	if (typeof word === "string") {
		return true;
	}

	// For object keywords, check "without" condition
	if (word.without && word.without !== "" && compiled.withoutRegex && compiled.withoutRegex.test(title)) {
		return false;
	}

	// Check ETV filtering
	if (word.etv_min === "" && word.etv_max === "") {
		// No ETV filtering defined, we have a match
		return true;
	}

	// Use shared utility for ETV condition checking
	return areEtvConditionsSatisfied(word, etv_min, etv_max);
}

function keywordMatchReturnFullObject(keywords, title, etv_min = null, etv_max = null, settingsMgr = null) {
	// Handle empty keywords array
	if (!keywords || keywords.length === 0) {
		return undefined;
	}

	// Check if we have a settings manager with compiled keywords
	if (settingsMgr && typeof settingsMgr.getCompiledKeywords === 'function') {
		try {
			// Try to get pre-compiled keywords from settings
			const keywordType = getKeywordType(keywords);
			if (keywordType) {
				// getCompiledKeywords already handles the path correctly
				const compiled = settingsMgr.getCompiledKeywords(keywordType);
				if (compiled && compiled.length > 0) {
					// Successfully using pre-compiled keywords - no logging needed
					for (let index = 0; index < keywords.length && index < compiled.length; index++) {
						const word = keywords[index];
						const compiledRegex = compiled[index];

						if (!compiledRegex) {
							continue;
						}

						if (testKeywordMatch(word, compiledRegex, title, etv_min, etv_max)) {
							return word;
						}
					}
					return undefined;
				}
			}
		} catch (error) {
			// Fall back to local compilation
			console.warn('[KeywordMatch] Failed to use pre-compiled keywords:', error);
		}
	}

	// Fallback to original implementation
	const cacheKey = getCacheKey(keywords);

	// Automatically pre-compile keywords if not already done
	// This ensures optimal performance without requiring explicit pre-compilation
	if (!compiledKeywordCache.has(cacheKey)) {
		const stats = precompileKeywords(keywords);
		// Log automatic pre-compilation if debug is enabled and not in test environment
		if (settingsMgr && settingsMgr.get("general.debugKeywords") &&
		    (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
			const cacheStatus = stats.cached ? " (from cache)" : " on first use";
			if (stats.failed > 0) {
				console.log(
					`[KeywordMatch] Auto pre-compiled ${stats.compiled}/${stats.total} keyword patterns${cacheStatus} (${stats.failed} failed)`
				);
			} else {
				console.log(`[KeywordMatch] Auto pre-compiled ${stats.compiled} keyword patterns${cacheStatus}`);
			}
		}
	}

	// Memory optimization: Use for loop instead of find() to avoid closure allocation
	const cache = compiledKeywordCache.get(cacheKey);
	if (!cache) {
		return undefined;
	}

	for (let index = 0; index < keywords.length; index++) {
		const word = keywords[index];
		const compiled = cache.get(index);

		if (!compiled) {
			continue;
		}

		if (testKeywordMatch(word, compiled, title, etv_min, etv_max)) {
			return word;
		}
	}

	return undefined;
}

/**
 * Helper function to determine keyword type from the keywords array
 * This is a heuristic based on the fact that settings returns the same array reference
 */
function getKeywordType(keywords) {
	// This will be set by the settings manager when it returns keyword arrays
	if (keywords.__keywordType) {
		return keywords.__keywordType;
	}
	return null;
}

function keywordMatch(keywords, title, etv_min = null, etv_max = null, settingsMgr = null) {
	let found = keywordMatchReturnFullObject(keywords, title, etv_min, etv_max, settingsMgr);

	if (typeof found === "object") {
		found = found.contains;
	}
	return found === undefined ? false : found;
}

/**
 * Check if any keywords have ETV conditions
 * @param {Array} keywords - Array of keyword objects
 * @returns {boolean} - True if any keyword has ETV conditions
 */
function hasAnyEtvConditions(keywords) {
	if (!keywords || keywords.length === 0) {
		return false;
	}

	const cacheKey = getCacheKey(keywords);

	// Get cache for this keywords array
	let cache = compiledKeywordCache.get(cacheKey);

	// If not cached, compile first
	if (!cache) {
		precompileKeywords(keywords);
		cache = compiledKeywordCache.get(cacheKey);
	}

	// Check if any compiled keyword has ETV condition flag
	for (const [, compiled] of cache) {
		if (compiled?.hasEtvCondition) {
			return true;
		}
	}

	return false;
}

/**
 * Clear the keyword cache - useful for memory management
 */
function clearKeywordCache() {
	const size = compiledKeywordCache.size;
	compiledKeywordCache.clear();
	settingsArrayCache = new WeakMap(); // Clear the settings array cache as well
	cacheKeyCounter = 0; // Reset counter
	console.log(`[KeywordMatch] Cleared ${size} cached keyword compilations`);
}

export { keywordMatch, keywordMatchReturnFullObject, precompileKeywords, hasAnyEtvConditions, clearKeywordCache, compileKeyword, createRegexPattern, getCompiledRegex };
