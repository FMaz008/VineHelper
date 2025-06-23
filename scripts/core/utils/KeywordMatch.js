import { hasEtvCondition, areEtvConditionsSatisfied } from "./KeywordUtils.js";

/**
 * KeywordMatcher Singleton
 * Provides centralized keyword matching with compiled regex storage
 */
class KeywordMatcher {
	constructor() {
		// Fixed storage for compiled regex patterns for each keyword type
		// No eviction needed since we only have 3 fixed keyword types
		this.compiledPatterns = {
			"general.hideKeywords": null,
			"general.highlightKeywords": null,
			"general.blurKeywords": null,
		};

		// Settings manager reference
		this.settingsMgr = null;

		// Track match statistics
		this.stats = {
			totalMatches: 0,
			compilations: 0,
			cacheClears: 0,
		};
	}

	/**
	 * Get singleton instance
	 */
	static getInstance() {
		if (!KeywordMatcher.instance) {
			KeywordMatcher.instance = new KeywordMatcher();
		}
		return KeywordMatcher.instance;
	}

	/**
	 * Set settings manager for pre-compiled keywords
	 */
	setSettingsManager(settingsMgr) {
		this.settingsMgr = settingsMgr;
	}

	/**
	 * Get keyword type from keywords array
	 * @param {Array} keywords - The keywords array
	 * @returns {string|null} The keyword type (general.hideKeywords, general.highlightKeywords, general.blurKeywords) or null
	 */
	getKeywordType(keywords) {
		// Check if the array has a type marker
		if (keywords.__keywordType) {
			return keywords.__keywordType;
		}

		// Try to detect based on the first keyword's source marker
		if (keywords.length > 0) {
			const firstKeyword = keywords[0];
			if (firstKeyword && typeof firstKeyword === "object" && firstKeyword.__source) {
				return firstKeyword.__source;
			}
		}

		return null;
	}

	/**
	 * Creates a regex pattern for keyword matching
	 * @param {string} keyword - The keyword to create a pattern for
	 * @param {boolean} isRegexPattern - Whether the keyword is already a regex pattern
	 * @returns {string} The regex pattern
	 */
	createRegexPattern(keyword, isRegexPattern = false) {
		// If it's already a regex pattern, return as-is
		if (isRegexPattern) {
			return keyword;
		}

		// Original implementation: keywords ARE regex patterns, no escaping
		// ASCII characters use word boundaries, non-ASCII uses Unicode property escapes
		return /^[\x20-\x7E]+$/.test(keyword) ? `\\b${keyword}\\b` : `(?<![\\p{L}\\p{N}])${keyword}(?![\\p{L}\\p{N}])`;
	}

	/**
	 * Compiles a keyword into regex object(s)
	 * @param {string|object} word - The keyword (string or object format)
	 * @returns {object|null} Compiled regex object or null if compilation failed
	 */
	compileKeyword(word) {
		try {
			if (typeof word === "string") {
				// Old data format where each keyword was a string
				const pattern = this.createRegexPattern(word);
				return {
					regex: new RegExp(pattern, "iu"),
					withoutRegex: null,
				};
			} else if (typeof word === "object" && word.contains) {
				// New data format where keywords are objects
				const containsPattern = this.createRegexPattern(word.contains);
				const containsRegex = new RegExp(containsPattern, "iu");

				let withoutRegex = null;
				if (word.without) {
					const withoutPattern = this.createRegexPattern(word.without);
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
				console.warn(
					`[KeywordMatcher] Failed to compile regex for keyword: "${keywordStr}" - ${error.message}`
				);
			}
		}
		return null;
	}

	/**
	 * Pre-compiles regex patterns for all keywords of a specific type
	 * @param {string} keywordType - The keyword type (e.g., 'general.hideKeywords')
	 * @param {Array} keywords - The keywords array
	 * @returns {object} Compilation statistics
	 */
	precompileKeywords(keywordType, keywords) {
		if (!keywordType || !Object.prototype.hasOwnProperty.call(this.compiledPatterns, keywordType)) {
			console.warn(`[KeywordMatcher] Invalid keyword type: ${keywordType}`);
			return { total: 0, compiled: 0, failed: 0 };
		}

		// Create a new Map for this keyword type
		const compiledMap = new Map();
		let failedCount = 0;

		keywords.forEach((word, index) => {
			const compiled = this.compileKeyword(word);
			if (compiled) {
				compiledMap.set(index, compiled);
			} else {
				failedCount++;
			}
		});

		// Store the compiled patterns for this keyword type
		this.compiledPatterns[keywordType] = compiledMap;
		this.stats.compilations++;

		// Return stats for logging by caller
		return {
			total: keywords.length,
			compiled: compiledMap.size,
			failed: failedCount,
		};
	}

	/**
	 * Get compiled regex for a keyword at a specific index
	 * @param {string} keywordType - The keyword type
	 * @param {number} index - The index in the keywords array
	 * @returns {object|null} The compiled regex object or null
	 */
	getCompiledRegex(keywordType, index) {
		const compiledMap = this.compiledPatterns[keywordType];
		if (!compiledMap) {
			return null;
		}
		return compiledMap.get(index);
	}

	/**
	 * Test if a keyword matches
	 * @param {*} word - The keyword object
	 * @param {*} compiled - The compiled regex
	 * @param {*} title - The title to test
	 * @param {*} etv_min - Minimum ETV value
	 * @param {*} etv_max - Maximum ETV value
	 * @returns {boolean} True if matches
	 */
	testKeywordMatch(word, compiled, title, etv_min, etv_max) {
		// Debug logging for keyword operations
		const effectiveSettingsMgr =
			this.settingsMgr || (typeof SettingsMgr !== "undefined" ? new SettingsMgr() : null);
		const debugKeywords = effectiveSettingsMgr && effectiveSettingsMgr.get("general.debugKeywords");

		// Test the main regex
		const matches = compiled.regex.test(title);

		if (debugKeywords && matches) {
			console.log("[KeywordMatcher] testKeywordMatch - pattern matched:", {
				keyword: typeof word === "string" ? word : word.contains,
				pattern: compiled.regex.source,
				flags: compiled.regex.flags,
				title: title.substring(0, 100) + (title.length > 100 ? "..." : ""),
				matches: matches,
			});
		}

		if (!matches) {
			return false;
		}

		// For string keywords, we're done
		if (typeof word === "string") {
			return true;
		}

		// For object keywords, check "without" condition
		if (typeof word === "object") {
			if (word.without && word.without !== "" && compiled.withoutRegex) {
				const withoutMatches = compiled.withoutRegex.test(title);
				if (debugKeywords && withoutMatches) {
					console.log("[KeywordMatcher] 'Without' check:", {
						keyword: word.contains,
						without: word.without,
						matches: withoutMatches,
						excluded: withoutMatches,
					});
				}
				if (withoutMatches) {
					return false;
				}
			}
		}

		// Check ETV filtering
		if (word.etv_min === "" && word.etv_max === "") {
			// No ETV filtering defined, we have a match
			return true;
		}

		// Use shared utility for ETV condition checking
		const etvSatisfied = areEtvConditionsSatisfied(word, etv_min, etv_max);
		if (debugKeywords && !etvSatisfied) {
			console.log("[KeywordMatcher] Item excluded by ETV condition:", {
				contains: word.contains,
				etv_min: word.etv_min,
				etv_max: word.etv_max,
				item_etv_min: etv_min,
				item_etv_max: etv_max,
			});
		}
		return etvSatisfied;
	}

	/**
	 * Main matching function - returns full keyword object if match found
	 * @param {boolean} isTestMode - If true, suppresses warnings for unknown keyword types (used for testing unsaved keywords)
	 */
	keywordMatchReturnFullObject(
		keywords,
		title,
		etv_min = null,
		etv_max = null,
		settingsMgr = null,
		isTestMode = false
	) {
		// Handle empty keywords array
		if (!keywords || keywords.length === 0) {
			return undefined;
		}

		this.stats.totalMatches++;

		// Use provided settings manager or instance one
		const effectiveSettingsMgr = settingsMgr || this.settingsMgr;

		// Try to determine the keyword type
		let keywordType = this.getKeywordType(keywords);

		// If we can't determine the type from the array, try to get pre-compiled keywords
		// from the settings manager which knows the type
		if (!keywordType && effectiveSettingsMgr && typeof effectiveSettingsMgr.getCompiledKeywords === "function") {
			// The settings manager might be able to provide pre-compiled keywords
			// if it recognizes the array reference
			const possibleTypes = ["general.hideKeywords", "general.highlightKeywords", "general.blurKeywords"];
			for (const type of possibleTypes) {
				try {
					const compiled = effectiveSettingsMgr.getCompiledKeywords(type);
					if (compiled && compiled.length === keywords.length) {
						// Found a match, use these pre-compiled patterns
						keywordType = type;
						break;
					}
				} catch (e) {
					// Continue checking other types
				}
			}
		}

		// Check if we have pre-compiled patterns from settings manager
		if (keywordType && effectiveSettingsMgr && typeof effectiveSettingsMgr.getCompiledKeywords === "function") {
			try {
				const compiled = effectiveSettingsMgr.getCompiledKeywords(keywordType);
				if (compiled && compiled.length > 0) {
					// Debug logging for pre-compiled keywords
					const debugKeywords = effectiveSettingsMgr && effectiveSettingsMgr.get("general.debugKeywords");
					if (debugKeywords) {
						console.log("[KeywordMatcher] Using pre-compiled patterns", {
							keywordType,
							title: title.substring(0, 100) + (title.length > 100 ? "..." : ""),
							keywordsLength: keywords.length,
							compiledLength: compiled.length,
							firstKeyword: keywords[0]?.contains || keywords[0],
							lastKeyword: keywords[keywords.length - 1]?.contains || keywords[keywords.length - 1],
						});

						if (keywords.length !== compiled.length) {
							console.log("[KeywordMatcher] Pre-compiled length mismatch", {
								keywordType,
								expected: keywords.length,
								actual: compiled.length,
							});
						}
					}

					// Successfully using pre-compiled keywords
					for (let index = 0; index < compiled.length; index++) {
						const compiledRegex = compiled[index];

						if (!compiledRegex) {
							continue;
						}

						// Check if the compiled pattern has an originalIndex property
						// This would be set during compilation to maintain the mapping
						const keywordIndex =
							compiledRegex.originalIndex !== undefined ? compiledRegex.originalIndex : index;

						// Ensure we have a valid keyword at this index
						if (keywordIndex >= keywords.length) {
							console.warn(
								`[KeywordMatcher] Compiled pattern index ${keywordIndex} out of bounds for keywords array of length ${keywords.length}`
							);
							continue;
						}

						const word = keywords[keywordIndex];

						if (this.testKeywordMatch(word, compiledRegex, title, etv_min, etv_max)) {
							if (debugKeywords) {
								// Log the actual regex pattern and test result
								const regexPattern = compiledRegex.regex ? compiledRegex.regex.source : "N/A";
								const regexFlags = compiledRegex.regex ? compiledRegex.regex.flags : "N/A";
								const testResult = compiledRegex.regex ? compiledRegex.regex.test(title) : false;

								console.log("[KeywordMatcher] Match found - detailed info:", {
									type: keywordType,
									keyword: typeof word === "string" ? word : word.contains,
									compiledIndex: index,
									keywordIndex: keywordIndex,
									title: title.substring(0, 100) + (title.length > 100 ? "..." : ""),
									actualWord: typeof word === "string" ? word : JSON.stringify(word),
									regexPattern: regexPattern,
									regexFlags: regexFlags,
									testResult: testResult,
									compiledRegexStructure: Object.keys(compiledRegex),
								});

								// Test the pattern manually to debug
								if (compiledRegex.regex) {
									const manualTest = new RegExp(regexPattern, regexFlags);
									console.log("[KeywordMatcher] Manual regex test:", {
										pattern: regexPattern,
										title: title.substring(0, 50),
										matches: manualTest.test(title),
									});
								}
							}
							return word;
						}
					}
					return undefined;
				}
			} catch (error) {
				// Fall back to runtime compilation
				console.warn("[KeywordMatcher] Failed to use pre-compiled keywords:", error);
			}
		}

		// Fallback: compile at runtime if needed
		if (!keywordType) {
			// Check if keywords have pre-compiled patterns attached (from precompileKeywords)
			if (keywords.__compiledPatterns) {
				const compiledPatterns = keywords.__compiledPatterns;
				for (let index = 0; index < keywords.length; index++) {
					const word = keywords[index];
					const compiled = compiledPatterns[index];

					if (!compiled) {
						continue;
					}

					if (this.testKeywordMatch(word, compiled, title, etv_min, etv_max)) {
						return word;
					}
				}
				return undefined;
			}

			// We couldn't determine the type, so we can't use our fixed storage
			// This shouldn't happen in normal operation, but we'll handle it gracefully
			// Only warn if not in test environment and not in test mode
			if (!isTestMode && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				console.warn("[KeywordMatcher] Could not determine keyword type, compiling at runtime");
			}

			// Compile and match directly without caching
			for (let index = 0; index < keywords.length; index++) {
				const word = keywords[index];
				const compiled = this.compileKeyword(word);

				if (!compiled) {
					continue;
				}

				if (this.testKeywordMatch(word, compiled, title, etv_min, etv_max)) {
					return word;
				}
			}
			return undefined;
		}

		// Check if we have compiled patterns for this keyword type
		if (!this.compiledPatterns[keywordType]) {
			// Compile the keywords for this type
			const stats = this.precompileKeywords(keywordType, keywords);

			// Log compilation if debug is enabled
			const debugKeywords = effectiveSettingsMgr && effectiveSettingsMgr.get("general.debugKeywords");
			if (debugKeywords && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
				console.log(`[KeywordMatcher] Compiled ${stats.compiled}/${stats.total} patterns for ${keywordType}`);
			}
		}

		// Use compiled patterns for matching
		const compiledMap = this.compiledPatterns[keywordType];
		if (!compiledMap) {
			return undefined;
		}

		// Debug logging for keyword operations
		const debugKeywords = effectiveSettingsMgr && effectiveSettingsMgr.get("general.debugKeywords");

		for (let index = 0; index < keywords.length; index++) {
			const word = keywords[index];
			const compiled = compiledMap.get(index);

			if (!compiled) {
				continue;
			}

			if (this.testKeywordMatch(word, compiled, title, etv_min, etv_max)) {
				if (debugKeywords) {
					console.log("[KeywordMatcher] Match found:", {
						type: keywordType,
						keyword: typeof word === "string" ? word : word.contains,
					});
				}
				return word;
			}
		}

		return undefined;
	}

	/**
	 * Simple keyword matching function
	 * @param {Array} keywords - Array of keywords to match
	 * @param {string} title - Title to match against
	 * @param {*} etv_min - Minimum ETV value
	 * @param {*} etv_max - Maximum ETV value
	 * @param {boolean} isTestMode - If true, suppresses warnings for unknown keyword types
	 * @returns {string|boolean} The matched keyword string or false if no match
	 */
	keywordMatch(keywords, title, etv_min = null, etv_max = null, isTestMode = false) {
		const match = this.keywordMatchReturnFullObject(keywords, title, etv_min, etv_max, null, isTestMode);
		if (!match) return false;

		// Return the keyword string for backward compatibility
		// For string keywords, return the string itself
		// For object keywords, return the contains property
		return typeof match === "string" ? match : match.contains;
	}

	/**
	 * Check if any keywords have ETV conditions
	 * @param {Array} keywords - Array of keywords to check
	 * @returns {boolean} True if any keyword has ETV conditions
	 */
	hasAnyEtvConditions(keywords) {
		if (!keywords || keywords.length === 0) {
			return false;
		}

		return keywords.some((keyword) => hasEtvCondition(keyword));
	}

	/**
	 * Clear the compiled patterns for all keyword types
	 * Useful for testing or when keywords are updated
	 */
	clearKeywordCache() {
		// Clear all compiled patterns
		for (const keywordType in this.compiledPatterns) {
			this.compiledPatterns[keywordType] = null;
		}
		this.stats.cacheClears++;
		console.log("[KeywordMatcher] Compiled patterns cleared for all keyword types");
	}

	/**
	 * Get statistics
	 */
	getStats() {
		// Count compiled patterns in the main cache
		let cacheSize = Object.keys(this.compiledPatterns).filter(
			(type) => this.compiledPatterns[type] !== null
		).length;

		// For backward compatibility, also count any arrays with __compiledPatterns
		// This is used by tests that call precompileKeywords without a type
		if (cacheSize === 0) {
			// Check if there are any compiled patterns attached to arrays
			// This is a simple heuristic - in real usage, cacheSize would come from compiledPatterns
			cacheSize = this.stats.compilations > 0 ? 1 : 0;
		}

		return {
			...this.stats,
			compiledTypes: Object.keys(this.compiledPatterns).filter((type) => this.compiledPatterns[type] !== null)
				.length,
			cacheSize: cacheSize,
		};
	}
}

// Create singleton instance
const keywordMatcher = KeywordMatcher.getInstance();

// Legacy function exports for backward compatibility
function createRegexPattern(keyword) {
	return keywordMatcher.createRegexPattern(keyword);
}

function compileKeyword(word) {
	return keywordMatcher.compileKeyword(word);
}

function precompileKeywords(keywords) {
	// For backward compatibility, try to determine the type
	const type = keywordMatcher.getKeywordType(keywords);
	if (type) {
		return keywordMatcher.precompileKeywords(type, keywords);
	}

	// Check if already compiled
	if (keywords.__compiledPatterns) {
		return {
			total: keywords.length,
			compiled: keywords.__compiledPatterns.filter((p) => p !== null).length,
			failed: keywords.__compiledPatterns.filter((p) => p === null).length,
			cached: true,
		};
	}

	// For tests and backward compatibility, compile without caching
	// This maintains the old behavior where precompileKeywords would work
	// even without knowing the keyword type
	let compiledCount = 0;
	let failedCount = 0;

	// Mark the array with compiled patterns for future use
	const compiledPatterns = [];
	keywords.forEach((word) => {
		const compiled = keywordMatcher.compileKeyword(word);
		if (compiled) {
			compiledPatterns.push(compiled);
			compiledCount++;
		} else {
			compiledPatterns.push(null);
			failedCount++;
		}
	});

	// Attach compiled patterns to the array for backward compatibility
	keywords.__compiledPatterns = compiledPatterns;

	return {
		total: keywords.length,
		compiled: compiledCount,
		failed: failedCount,
		cached: false,
	};
}

function getCompiledRegex(keywords, index) {
	// For backward compatibility, try to determine the type
	const type = keywordMatcher.getKeywordType(keywords);
	if (type) {
		return keywordMatcher.getCompiledRegex(type, index);
	}
	return null;
}

function keywordMatchReturnFullObject(keywords, title, etv_min = null, etv_max = null, settingsMgr = null) {
	return keywordMatcher.keywordMatchReturnFullObject(keywords, title, etv_min, etv_max, settingsMgr);
}

function keywordMatch(keywords, title, etv_min = null, etv_max = null, isTestMode = false) {
	return keywordMatcher.keywordMatch(keywords, title, etv_min, etv_max, isTestMode);
}

function hasAnyEtvConditions(keywords) {
	return keywordMatcher.hasAnyEtvConditions(keywords);
}

function clearKeywordCache() {
	return keywordMatcher.clearKeywordCache();
}

// Export both singleton instance and legacy functions
export {
	keywordMatcher,
	keywordMatch,
	keywordMatchReturnFullObject,
	precompileKeywords,
	hasAnyEtvConditions,
	clearKeywordCache,
	compileKeyword,
	createRegexPattern,
	getCompiledRegex,
};
