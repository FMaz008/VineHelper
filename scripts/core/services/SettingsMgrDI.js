/**
 * Settings Manager with Dependency Injection
 *
 * This is a refactored version of SettingsMgr that:
 * - Uses dependency injection instead of singleton pattern
 * - Accepts a storage adapter for testability
 * - Maintains backward compatibility with existing API
 * - Can be gradually adopted throughout the codebase
 */

// Use relative import for better testability
import { Logger } from "../utils/Logger.js";

export class SettingsMgrDI {
	#storageAdapter;
	#logger;
	#defaultSettings;
	#settings;
	#isLoaded = false;
	#loadPromise;
	#arrayCache = new Map();
	#regexCache = new Map();
	#debugKeywords = false;
	#debugSettings = false;
	#debugStorage = false;

	constructor(storageAdapter, logger = new Logger()) {
		this.#storageAdapter = storageAdapter;
		this.#logger = logger;
		this.#settings = {};
		this.#getDefaultSettings();

		// Initialize settings on construction
		this.#loadPromise = this.#initializeSettings();
	}

	async #initializeSettings() {
		try {
			await this.#loadSettingsFromStorage();
			this.#isLoaded = true;
			this.#updateDebugFlags();
			this.#logger.add("SettingsMgr: Settings loaded.");
			return true;
		} catch (error) {
			this.#logger.add(`SettingsMgr: Failed to load settings: ${error.message}`);
			throw error;
		}
	}

	#updateDebugFlags() {
		// Update debug flags from settings
		this.#debugKeywords = this.get("general.debugKeywords") || false;
		this.#debugSettings = this.get("general.debugSettings") || false;
		this.#debugStorage = this.get("general.debugStorage") || false;
	}

	// Return true if the user has a valid premium membership on Patreon
	isPremiumUser(tier = 2) {
		return parseInt(this.get("general.patreon.tier")) >= tier;
	}

	async waitForLoad() {
		return this.#loadPromise;
	}

	isLoaded() {
		return this.#isLoaded;
	}

	async refresh() {
		await this.#loadSettingsFromStorage();
	}

	get(settingPath, undefinedReturnDefault = true) {
		// Check if this is a keyword array that should be cached
		const keywordPaths = ["general.highlightKeywords", "general.hideKeywords", "general.blurKeywords"];

		if (keywordPaths.includes(settingPath)) {
			// Return cached array reference if available
			if (this.#arrayCache.has(settingPath)) {
				return this.#arrayCache.get(settingPath);
			}
		}

		let answer = this.#getFromObject(this.#settings, settingPath);

		// If the value is not found in the settings, check if we should return the default value
		if (answer == undefined && undefinedReturnDefault) {
			answer = this.#getFromObject(this.#defaultSettings, settingPath);
		}

		// Cache keyword arrays to ensure same reference is returned
		if (keywordPaths.includes(settingPath) && Array.isArray(answer)) {
			// Tag the array with its type for identification
			Object.defineProperty(answer, "__keywordType", {
				value: settingPath,
				writable: false,
				enumerable: false,
				configurable: true,
			});
			this.#arrayCache.set(settingPath, answer);
		}

		return answer;
	}

	#getFromObject(obj, settingPath) {
		const pathArray = settingPath.split(".");
		return pathArray.reduce((prev, curr) => prev && prev[curr], obj);
	}

	async set(settingPath, value, reloadSettings = true) {
		// Check if this is a keyword array that needs compilation
		const keywordPaths = ["general.highlightKeywords", "general.hideKeywords", "general.blurKeywords"];
		const isKeywordPath = keywordPaths.includes(settingPath);

		// Don't go through the hassle of updating the value if it did not change
		// UNLESS it's a keyword path that might need compilation
		if (!isKeywordPath && this.get(settingPath, false) == value) {
			return false;
		}

		// For keyword paths, check if compiled patterns exist
		if (isKeywordPath) {
			const existingValue = this.get(settingPath, false);
			const valuesEqual =
				existingValue === value ||
				(Array.isArray(existingValue) &&
					Array.isArray(value) &&
					JSON.stringify(existingValue) === JSON.stringify(value));

			if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				console.log(`[SettingsMgrDI] Keyword path ${settingPath} value comparison:`, {
					existingIsArray: Array.isArray(existingValue),
					newIsArray: Array.isArray(value),
					valuesEqual,
					existingLength: existingValue?.length,
					newLength: value?.length,
				});
			}

			if (valuesEqual) {
				// Check if compiled patterns already exist
				const pathParts = settingPath.split(".");
				const lastPart = pathParts[pathParts.length - 1];
				const compiledKey = lastPart + "_compiled";
				const parentPath = pathParts.slice(0, -1);
				const parent =
					parentPath.length > 0 ? this.#getFromObject(this.#settings, parentPath.join(".")) : this.#settings;

				if (
					parent &&
					parent[compiledKey] &&
					Array.isArray(parent[compiledKey]) &&
					parent[compiledKey].length > 0
				) {
					if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
						console.log(`[SettingsMgrDI] Compiled patterns already exist for ${settingPath}, skipping`);
					}
					// Compiled patterns already exist, no need to recompile
					return false;
				}
				if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
					console.log(`[SettingsMgrDI] No compiled patterns for ${settingPath}, will compile`);
				}
				// Compiled patterns don't exist, continue to compile them
			}
		}

		const pathArray = settingPath.split(".");
		const lastKey = pathArray.pop();

		// Traverse the object and create missing intermediate objects if needed
		let current = this.#settings;
		for (let key of pathArray) {
			if (!current[key]) {
				current[key] = {};
			}
			current = current[key];
		}

		// Set the final value
		current[lastKey] = value;

		// Clear array cache for keyword paths when they are updated
		const keywordPathsList = ["general.highlightKeywords", "general.hideKeywords", "general.blurKeywords"];
		if (keywordPathsList.includes(settingPath)) {
			this.#arrayCache.delete(settingPath);
			// Also clear regex cache
			this.#regexCache.delete(settingPath);

			if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				console.log(
					`[SettingsMgrDI] Keyword path detected: ${settingPath}, value is array: ${Array.isArray(value)}, length: ${value?.length}`
				);
			}

			// Automatically compile and save keywords
			if (Array.isArray(value) && value.length > 0) {
				if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
					console.log(`[SettingsMgrDI] Starting keyword compilation for ${settingPath}`);
				}
				try {
					// Import all needed functions at the beginning so they're available throughout
					const { precompileKeywords, getCompiledRegex } = await import("../utils/KeywordMatch.js");
					const compilationResult = precompileKeywords(value);

					if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
						console.log(`[SettingsMgrDI] Compilation result:`, {
							path: settingPath,
							compiledCount: compilationResult.compiled,
							failed: compilationResult.failed,
							total: compilationResult.total,
						});
					}

					// Convert compiled regexes to storable format
					// We need to use getCompiledRegex to retrieve from the global cache
					let compiledPatterns = [];
					try {
						for (let index = 0; index < value.length; index++) {
							try {
								const keyword = value[index];
								const keywordStr = typeof keyword === "string" ? keyword : keyword?.contains || "";

								const compiled = getCompiledRegex(value, index);
								if (compiled && compiled.regex) {
									const patternObj = {
										pattern: compiled.regex.source,
										flags: compiled.regex.flags,
										withoutPattern: compiled.withoutRegex ? compiled.withoutRegex.source : null,
										withoutFlags: compiled.withoutRegex ? compiled.withoutRegex.flags : null,
										hasEtvCondition: compiled.hasEtvCondition || false,
										originalIndex: index,
									};

									compiledPatterns.push(patternObj);
								} else {
									compiledPatterns.push(null);
								}
							} catch (error) {
								console.error(`[SettingsMgrDI] Error retrieving pattern at index ${index}:`, error);
								compiledPatterns.push(null);
							}
						}

						if (
							this.#debugKeywords &&
							(typeof process === "undefined" || process.env.NODE_ENV !== "test")
						) {
							console.log(
								`[SettingsMgrDI] Compiled ${compiledPatterns.filter((p) => p !== null).length}/${value.length} patterns for ${settingPath}`
							);
						}
					} catch (outerError) {
						if (
							this.#debugKeywords &&
							(typeof process === "undefined" || process.env.NODE_ENV !== "test")
						) {
							console.error(`[SettingsMgrDI] CRITICAL ERROR in pattern retrieval:`, outerError);
							console.error(`[SettingsMgrDI] Error stack:`, outerError.stack);
						}
						// Continue with empty patterns rather than failing completely
						compiledPatterns = [];
					}

					// Save compiled patterns at the same level as the keywords
					// For example, if keywords are at general.blurKeywords,
					// compiled patterns should be at general.blurKeywords_compiled
					const compiledKey = lastKey + "_compiled";
					current[compiledKey] = compiledPatterns;

					// Debug: Log what we're about to store
					if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
						console.log(`[SettingsMgrDI] Storing compiled patterns:`, {
							path: settingPath,
							compiledKey: compiledKey,
							compiledPatternsLength: compiledPatterns.length,
							firstPattern: compiledPatterns[0],
							currentKeys: Object.keys(current),
							currentIsGeneralObject: current === this.#settings.general,
							pathArray: pathArray,
						});
					}

					// Verify the patterns were actually stored
					if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
						console.log(`[SettingsMgrDI] After storing - verification:`, {
							compiledInCurrent: compiledKey in current,
							compiledInGeneral: this.#settings.general && compiledKey in this.#settings.general,
							generalKeys: this.#settings.general
								? Object.keys(this.#settings.general).filter((k) => k.includes("_compiled"))
								: [],
						});
					}

					this.#logger.add(
						`SettingsMgr: Auto-compiled ${compilationResult.compiled} patterns for ${settingPath}`
					);

					// Verify the patterns were actually stored
					const verifyPath = pathArray.join(".") + "." + compiledKey;
					const stored = this.#getFromObject(this.#settings, verifyPath);

					// Debug logging
					if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
						// Log the current state before storing
						console.log(`[SettingsMgrDI] BEFORE storing compiled patterns:`, {
							path: settingPath,
							compiledKey: compiledKey,
							currentObject: Object.keys(current),
							hasCompiledKeyBefore: compiledKey in current,
						});

						console.log(`[SettingsMgrDI] Compiled and stored patterns:`, {
							path: settingPath,
							compiledKey: compiledKey,
							storageLocation: `${pathArray.join(".")}.${compiledKey}`,
							compiledCount: compilationResult.compiled,
							totalPatterns: compiledPatterns.length,
							validPatterns: compiledPatterns.filter((p) => p !== null).length,
							samplePattern: compiledPatterns[0],
							verificationPath: verifyPath,
							storedSuccessfully: !!stored && Array.isArray(stored),
							storedLength: stored?.length || 0,
						});

						// Log the state after storing
						console.log(`[SettingsMgrDI] AFTER storing compiled patterns:`, {
							currentKeys: Object.keys(current),
							hasCompiledKeyAfter: compiledKey in current,
							compiledValueType: Array.isArray(current[compiledKey])
								? "array"
								: typeof current[compiledKey],
							compiledLength: current[compiledKey]?.length || 0,
						});
					}
				} catch (error) {
					this.#logger.add(
						`SettingsMgr: Failed to auto-compile keywords for ${settingPath}: ${error.message}`
					);
				}
			}
		}

		await this.#save();

		// Update debug flags if any debug setting changed
		if (settingPath.startsWith("general.debug")) {
			this.#updateDebugFlags();
		}

		// Debug logging to verify what's in memory after save
		if (
			this.#debugKeywords &&
			keywordPathsList.includes(settingPath) &&
			(typeof process === "undefined" || process.env.NODE_ENV !== "test")
		) {
			const generalSettings = this.#settings.general || {};
			const compiledKeys = Object.keys(generalSettings).filter((k) => k.includes("_compiled"));
			console.log(`[SettingsMgrDI] AFTER save - memory state:`, {
				path: settingPath,
				compiledKeysInMemory: compiledKeys,
				specificCompiledKey: lastKey + "_compiled",
				hasSpecificCompiled: !!generalSettings[lastKey + "_compiled"],
				specificCompiledLength: generalSettings[lastKey + "_compiled"]?.length || 0,
			});
		}

		// Reload settings if requested (but after saving!)
		if (reloadSettings) {
			await this.#loadSettingsFromStorage(true);
		}

		return true;
	}

	/**
	 * Clear the keyword regex cache when settings change
	 */
	clearKeywordCache() {
		this.#regexCache.clear();
		this.#logger.add("SettingsMgr: Cleared keyword regex cache");
	}

	/**
	 * Get compiled keywords with memory caching
	 * @param {string} key - The keyword setting key (e.g., 'general.highlightKeywords')
	 * @returns {Array} Array of compiled regex objects
	 */
	getCompiledKeywords(key) {
		// Check memory cache first
		if (this.#regexCache.has(key)) {
			return this.#regexCache.get(key);
		}

		// Get pre-compiled patterns from settings
		// The compiled patterns are stored alongside the keywords
		// For example: general.blurKeywords_compiled is at the same level as general.blurKeywords
		const pathParts = key.split(".");
		const lastPart = pathParts[pathParts.length - 1];
		const compiledPath = pathParts
			.slice(0, -1)
			.concat(lastPart + "_compiled")
			.join(".");
		const patterns = this.get(compiledPath);

		// Additional debug to check what's in settings
		if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
			// Check if the compiled patterns exist in the settings object
			const settingsSnapshot = JSON.parse(JSON.stringify(this.#settings));
			const generalSettings = settingsSnapshot.general || {};
			console.log(`[SettingsMgrDI] Checking storage for ${key}:`, {
				compiledKey: lastPart + "_compiled",
				hasCompiledInGeneral: !!generalSettings[lastPart + "_compiled"],
				compiledLength: generalSettings[lastPart + "_compiled"]?.length || 0,
				allGeneralKeys: Object.keys(generalSettings).filter((k) => k.includes("_compiled")),
			});
		}

		// Debug logging
		if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
			console.log(`[SettingsMgrDI] getCompiledKeywords for ${key}:`, {
				originalKey: key,
				compiledPath: compiledPath,
				patternsFound: !!patterns,
				patternsLength: patterns?.length || 0,
				isArray: Array.isArray(patterns),
				samplePattern: patterns?.[0],
			});
		}

		// Get the raw keywords to validate
		const raw = this.get(key);

		if (!patterns || !Array.isArray(patterns)) {
			// Fallback: compile on demand if no compiled version
			this.#logger.add(`SettingsMgr: No pre-compiled patterns found for ${key}, compiling on demand`);
			if (!raw || !Array.isArray(raw)) {
				return [];
			}

			// Import dynamically to avoid circular dependencies
			return this.#compileOnDemand(key, raw);
		}

		// Validate that compiled patterns match current keywords
		if (raw && Array.isArray(raw)) {
			// Check if the number of patterns matches the number of keywords
			if (patterns.length !== raw.length) {
				this.#logger.add(
					`SettingsMgr: Compiled patterns length (${patterns.length}) doesn't match keywords length (${raw.length}) for ${key}, recompiling`
				);
				return this.#compileOnDemand(key, raw);
			}

			// Check if any pattern is missing originalIndex (indicates old format)
			const hasOldFormat = patterns.some((p) => p && p.pattern && p.originalIndex === undefined);
			if (hasOldFormat) {
				this.#logger.add(
					`SettingsMgr: Compiled patterns are in old format (missing originalIndex) for ${key}, recompiling`
				);
				return this.#compileOnDemand(key, raw);
			}
		}

		// Convert patterns to RegExp objects
		const regexes = [];
		patterns.forEach((p, index) => {
			if (p && p.pattern) {
				try {
					const regex = {
						regex: new RegExp(p.pattern, p.flags || "iu"),
						withoutRegex: p.withoutPattern ? new RegExp(p.withoutPattern, p.withoutFlags || "iu") : null,
						hasEtvCondition: p.hasEtvCondition || false,
						originalIndex: p.originalIndex !== undefined ? p.originalIndex : index,
					};
					regexes.push(regex);
				} catch (error) {
					this.#logger.add(
						`SettingsMgr: Failed to create RegExp for pattern at index ${index}: ${error.message}`
					);
					regexes.push(null);
				}
			} else {
				regexes.push(null);
			}
		});

		// Cache in memory
		this.#regexCache.set(key, regexes);
		return regexes;
	}

	/**
	 * Compile keywords on demand (fallback)
	 * @private
	 */
	async #compileOnDemand(key, keywords) {
		try {
			// Dynamically import to avoid circular dependencies
			const { precompileKeywords, compileKeyword } = await import("../utils/KeywordMatch.js");

			// Compile keywords
			const compilationResult = precompileKeywords(keywords);

			// Build regex array and storable patterns
			const regexes = [];
			const storablePatterns = [];

			keywords.forEach((keyword, index) => {
				const compiled = compileKeyword(keyword);
				if (compiled) {
					regexes.push(compiled);
					// Convert to storable format
					storablePatterns.push({
						pattern: compiled.regex.source,
						flags: compiled.regex.flags,
						withoutPattern: compiled.withoutRegex ? compiled.withoutRegex.source : null,
						withoutFlags: compiled.withoutRegex ? compiled.withoutRegex.flags : null,
						hasEtvCondition: compiled.hasEtvCondition || false,
						originalIndex: index,
					});
				} else {
					regexes.push(null);
					storablePatterns.push(null);
				}
			});

			// Save compiled patterns back to storage
			const compiledPath = key.replace(/\./g, ".") + "_compiled";
			const pathParts = compiledPath.split(".");

			// Navigate to the parent object and set the compiled patterns
			let current = this.#settings;
			for (let i = 0; i < pathParts.length - 1; i++) {
				if (!current[pathParts[i]]) {
					current[pathParts[i]] = {};
				}
				current = current[pathParts[i]];
			}
			current[pathParts[pathParts.length - 1]] = storablePatterns;

			// Save to storage
			await this.#save();

			this.#logger.add(`SettingsMgr: Recompiled and saved ${storablePatterns.length} patterns for ${key}`);

			// Cache in memory
			this.#regexCache.set(key, regexes);
			return regexes;
		} catch (error) {
			this.#logger.add(`SettingsMgr: Failed to compile keywords on demand: ${error.message}`);
			return [];
		}
	}

	async #save() {
		try {
			// Debug logging for save operation
			if (this.#debugStorage && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				const generalSettings = this.#settings.general || {};
				const compiledKeys = Object.keys(generalSettings).filter((k) => k.includes("_compiled"));
				console.log(`[SettingsMgrDI] SAVING settings to Chrome storage:`, {
					hasGeneralObject: !!this.#settings.general,
					compiledKeysInGeneral: compiledKeys,
					compiledKeysSample:
						compiledKeys.length > 0
							? {
									[compiledKeys[0]]: Array.isArray(generalSettings[compiledKeys[0]])
										? `Array(${generalSettings[compiledKeys[0]].length})`
										: typeof generalSettings[compiledKeys[0]],
								}
							: "none",
				});
			}

			await this.#storageAdapter.set("settings", this.#settings);

			if (this.#debugStorage && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				console.log(`[SettingsMgrDI] Settings SAVED successfully`);
			}
		} catch (e) {
			if (e.name === "QuotaExceededError") {
				// The local storage space has been exceeded
				alert("Local storage quota exceeded! Hidden items will be cleared to make space.");
				await this.#storageAdapter.set("hiddenItems", []);
				await this.#save();
			} else {
				// Some other error occurred
				alert("Error:", e.name, e.message);
				return false;
			}
		}
	}

	async #loadSettingsFromStorage(skipMigration = false) {
		const settings = await this.#storageAdapter.get("settings");

		// Debug logging for loaded settings
		const debugStorage = settings?.general?.debugStorage;
		if (debugStorage && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
			const generalSettings = settings?.general || {};
			const compiledKeys = Object.keys(generalSettings).filter((k) => k.includes("_compiled"));
			console.log(`[SettingsMgrDI] LOADED settings from Chrome storage:`, {
				hasSettings: !!settings,
				hasGeneralObject: !!settings?.general,
				compiledKeysInGeneral: compiledKeys,
				compiledKeysSample: compiledKeys.map((key) => ({
					key,
					type: Array.isArray(generalSettings[key])
						? `Array(${generalSettings[key].length})`
						: typeof generalSettings[key],
					firstItem: generalSettings[key]?.[0],
				})),
			});
		}

		// Only clear array cache if settings actually changed
		// Skip comparison on initial load (when this.#settings is empty)
		const isInitialLoad = !this.#settings || Object.keys(this.#settings).length === 0;
		const settingsChanged = !isInitialLoad && JSON.stringify(settings) !== JSON.stringify(this.#settings);

		if (settingsChanged) {
			if (this.#debugSettings && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				console.log(`[SettingsMgrDI] Settings changed, clearing array cache`);
			}
			this.#arrayCache.clear();
		}

		// If no settings exist already, create the default ones
		if (!settings || Object.keys(settings).length === 0) {
			// Will generate default settings
			await this.#storageAdapter.clear();
			this.#settings = { ...this.#defaultSettings };
			await this.#save();
		} else {
			this.#settings = { ...settings };
		}

		if (!skipMigration) {
			await this.#migrate();

			// Only check for keyword compilation on initial load (not on reload after compilation)
			// Check if we need to compile keywords that don't have compiled versions
			// This MUST happen AFTER this.#settings is assigned, otherwise compiled patterns will be lost
			const keywordPaths = ["general.highlightKeywords", "general.hideKeywords", "general.blurKeywords"];
			const compilationNeeded = [];

			for (const path of keywordPaths) {
				const keywords = this.get(path);
				// Extract the last part of the path to check for compiled version
				const pathParts = path.split(".");
				const lastPart = pathParts[pathParts.length - 1];
				const compiledKey = lastPart + "_compiled";

				// Check if compiled patterns exist at the same level as keywords
				// For example, general.highlightKeywords_compiled should be in general object
				const parentPath = pathParts.slice(0, -1);
				const parent =
					parentPath.length > 0 ? this.#getFromObject(this.#settings, parentPath.join(".")) : this.#settings;
				const hasCompiled =
					parent &&
					parent[compiledKey] &&
					Array.isArray(parent[compiledKey]) &&
					parent[compiledKey].length > 0;

				if (keywords && keywords.length > 0 && !hasCompiled) {
					// Keywords exist but no compiled version - mark for compilation
					compilationNeeded.push(path);

					// Debug logging
					if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
						console.log(`[SettingsMgrDI] Missing compiled patterns for ${path}, will compile`);
					}
				}
			}

			// Compile all needed keywords in batch
			if (compilationNeeded.length > 0) {
				if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
					console.log(`[SettingsMgrDI] Compiling keywords for paths:`, compilationNeeded);
				}

				// Compile each path without reloading
				for (const path of compilationNeeded) {
					const keywords = this.get(path);
					await this.set(path, keywords, false); // false = don't reload settings
				}

				// After all compilations are done, reload settings once to get compiled patterns into memory
				if (this.#debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
					console.log(`[SettingsMgrDI] All keyword compilations complete, reloading settings`);
				}
				await this.#loadSettingsFromStorage(true); // true = skip migration to avoid infinite loop
			}
		}
	}

	async #migrate() {
		// V2.2.0: Move the keybinding settings
		if (this.#settings.general.keyBindings !== undefined) {
			this.#settings.keyBindings = {};
			this.#settings.keyBindings.active = this.#settings.general.keyBindings;
			this.#settings.keyBindings.nextPage = "n";
			this.#settings.keyBindings.previousPage = "p";
			this.#settings.keyBindings.RFYPage = "r";
			this.#settings.keyBindings.AFAPage = "a";
			this.#settings.keyBindings.ALLPage = "l";
			this.#settings.keyBindings.AIPage = "i";
			this.#settings.keyBindings.hideAll = "h";
			this.#settings.keyBindings.showAll = "s";
			this.#settings.keyBindings.debug = "d";
			this.#settings.general.keyBindings = undefined;
			await this.#save();
		}

		// V2.2.3: Configure garbage collector for hidden items
		if (this.#settings.general.hiddenItemsCacheSize == undefined) {
			this.#settings.general.hiddenItemsCacheSize = 9;
			await this.#save();
		}
		if (this.#settings.general.newItemNotificationImage == undefined) {
			this.#settings.general.newItemNotificationImage = true;
			await this.#save();
		}

		// v2.2.7
		if (this.#settings.general.displayNewItemNotifications == undefined) {
			this.#settings.general.displayNewItemNotifications = this.#settings.general.newItemNotification;
			await this.#save();
		}

		// v2.3.3
		if (this.#settings.general.hideKeywords == undefined) {
			this.#settings.general.hideKeywords = [];
			await this.#save();
		}
		if (this.#settings.general.highlightKeywords == undefined) {
			this.#settings.general.highlightKeywords = [];
			await this.#save();
		}

		// v2.7.6
		if (this.#settings.notification == undefined) {
			this.#logger.add("SettingsMgr: Updating settings to v2.7.6 format...");
			// Convert the old settings to the new format
			this.#settings.notification = {
				active: this.#settings.general.newItemNotification,
				reduce: this.#settings.general.reduceNotifications,
				screen: {
					active: this.#settings.general.displayNewItemNotifications,
					thumbnail: this.#settings.general.newItemNotificationImage,
					regular: {
						sound: "0",
						volume: 0,
					},
				},
				monitor: {
					hideList: this.#settings.general.newItemMonitorNotificationHiding,
					hideDuplicateThumbnail: this.#settings.general.newItemMonitorDuplicateImageHiding,
					regular: {
						sound: "notification",
						volume: this.#settings.general.newItemMonitorNotificationSound == 2 ? 0 : 1,
					},
					highlight: {
						sound: "notification",
						volume: 1,
						color: "#FFE815",
					},
					zeroETV: {
						sound: "0",
						volume: 1,
						color: "#64af4b",
					},
				},
			};
			this.#settings.customCSS = "";
			delete this.#settings.general.newItemNotification;
			delete this.#settings.general.displayNewItemNotifications;
			delete this.#settings.general.newItemNotificationImage;
			delete this.#settings.general.newItemMonitorNotificationHiding;
			delete this.#settings.general.newItemMonitorDuplicateImageHiding;
			delete this.#settings.general.newItemMonitorNotificationSound;
			delete this.#settings.general.reduceNotifications;
			delete this.#settings.general.newItemNotificationVolume;
			delete this.#settings.general.newItemNotificationSound;
			delete this.#settings.general.newItemMonitorNotificationVolume;
			delete this.#settings.general.newItemMonitorNotificationSoundCondition;

			delete this.#settings.general.firstVotePopup;
			delete this.#settings.unavailableTab.consensusDiscard;
			delete this.#settings.unavailableTab.selfDiscard;
			delete this.#settings.unavailableTab.unavailableOpacity;
			delete this.#settings.unavailableTab.votingToolbar;
			delete this.#settings.unavailableTab.consensusThreshold;

			await this.#save();
		}

		// V3.1.0
		if (this.#settings.notification.monitor.tileSize == undefined) {
			this.#settings.notification.monitor.tileSize = this.#settings.tileSize;
			await this.#save();
		}

		// V3.4.0
		if (this.get("general.deviceName", false) == undefined) {
			await this.set("general.blindLoading", false);
		}
		if (this.get("pinnedTab.remote", false) == undefined) {
			await this.set("pinnedTab.remote", this.get("hiddenTab.remote", false));
		}
		if (this.get("notification.monitor.sortType", false) == "date") {
			await this.set("notification.monitor.sortType", "date_desc");
		}
	}

	#getDefaultSettings() {
		this.#defaultSettings = {
			unavailableTab: {
				active: true,
			},

			general: {
				bookmark: false,
				bookmarkColor: "#90ee90",
				bookmarkDate: 0,
				blindLoading: false,
				blurKeywords: [],
				unblurImageOnHover: false,
				country: null,
				customCSS: "",
				detailsIcon: true,
				deviceName: null,
				discoveryFirst: true,
				displayETV: true,
				displayFirstSeen: true,
				displayFullTitleTooltip: false,
				displayModalETV: false,
				displayVariantIcon: false,
				displayVariantButton: false,
				fingerprint: null,
				forceTango: false, //if true, force isTangoEligible to false
				GDPRPopup: true,
				hiddenItemsCacheSize: 4,
				hideCategoriesRFYAFA: false,
				hideKeywords: [],
				hideNoNews: true,
				scrollToRFY: false,
				hideOptOutButton: false,
				hideRecommendations: false,
				hideSideCart: false,
				highlightColor: {
					active: true,
					color: "#FFE815",
					ignore0ETVhighlight: false,
					ignoreUnknownETVhighlight: false,
				},
				highlightKeywords: [],
				highlightKWFirst: true,
				listView: false,
				modalNavigation: false,
				patreon: {
					tier: 0,
				},
				projectedAccountStatistics: false,
				reviewToolbar: true,
				tileSize: {
					active: true,
					enabled: true,
					fontSize: 14,
					iconSize: 14,
					titleSpacing: 50,
					toolbarFontSize: 10,
					verticalSpacing: 20,
					width: 236,
				},
				topPagination: true,
				toolbarBackgroundColor: "#FFFFFF",
				skipPrimeAd: false,
				unknownETVHighlight: {
					active: false,
					color: "#FF3366",
				},
				uuid: null,
				verbosePagination: false,
				verbosePaginationStartPadding: 5,
				versionInfoPopup: 0,
				zeroETVHighlight: {
					active: true,
					color: "#64af4b",
				},
				debugTabTitle: false,
				debugPlaceholders: false,
				debugTitleDisplay: false,
				debugMemory: false,
				debugBulkOperations: false,
				debugMemoryAutoSnapshot: false,
				debugKeywords: false,
				debugWebsocket: false,
				debugServercom: false,
				debugServiceWorker: false,
				debugSettings: false,
				debugStorage: false,
				debugCoordination: false,
				debugSound: false,
				debugDuplicates: false,
				debugVisibility: false,
				debugItemProcessing: false,
			},
			metrics: {
				minutesUsed: 0,
			},
			notification: {
				active: false,
				hideList: true,
				autoload: {
					min: 5,
					max: 10,
					hourStart: "03:00",
					hourEnd: "17:00",
				},
				monitor: {
					"24hrsFormat": false,
					autoTruncate: true,
					autoTruncateLimit: 1000,
					blockNonEssentialListeners: false,
					mouseoverPause: false,
					pauseOverlay: false,
					bump0ETV: true,
					filterQueue: -1,
					filterType: -1,
					placeholders: true,
					highlight: {
						color: "#FFE815",
						colorActive: true,
						sound: "0",
						volume: 1,
						ignore0ETVhighlight: false,
						ignoreUnknownETVhighlight: false,
					},
					hideDuplicateThumbnail: false,
					hideGoldNotificationsForSilverUser: false,
					listView: false,
					openLinksInNewTab: "1",
					preventUnload: true,
					regular: {
						sound: "0",
						volume: 1,
					},
					sortType: "date_desc",
					tileSize: {
						fontSize: 14,
						iconSize: 14,
						titleSpacing: 50,
						toolbarFontSize: 10,
						verticalSpacing: 20,
						width: 236,
					},
					unknownETV: {
						color: "#FF3366",
						colorActive: false,
					},
					zeroETV: {
						color: "#64af4b",
						colorActive: true,
						sound: "0",
						volume: 1,
					},
				},
				pushNotifications: false,
				pushNotificationsAFA: false,
				reduce: false,
				screen: {
					active: false,
					regular: {
						sound: "0",
						volume: 1,
					},
					thumbnail: true,
				},
				soundCooldownDelay: 2000,
			},

			keyBindings: {
				active: true,
				AFAPage: "a",
				AIPage: "i",
				ALLPage: "l",
				debug: "d",
				hideAll: "h",
				nextPage: "n",
				pauseFeed: "f",
				previousPage: "p",
				RFYPage: "r",
				showAll: "s",
			},

			hiddenTab: {
				active: true,
				remote: false,
			},

			pinnedTab: {
				active: true,
				remote: false,
			},

			discord: {
				active: false,
				guid: null,
			},

			thorvarium: {
				categoriesWithEmojis: false,
				collapsableCategories: false,
				ETVModalOnTop: false,
				limitedQuantityIcon: false,
				mediumItems: true,
				mobileandroid: false,
				mobileios: false,
				moreDescriptionText: false,
				paginationOnTop: false,
				removeAssociateHeader: false,
				removeFooter: false,
				removeHeader: false,
				RFYAFAAITabs: false,
				smallItems: false,
				stripedCategories: false,
			},
		};
	}
}
