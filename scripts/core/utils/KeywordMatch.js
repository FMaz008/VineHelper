// Pre-compiled regex cache for keywords
// Using WeakMap to allow garbage collection when keywords array is replaced
const compiledKeywordCache = new WeakMap();

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

			return {
				regex: containsRegex,
				withoutRegex: withoutRegex,
			};
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
	// Check if already compiled
	if (compiledKeywordCache.has(keywords)) {
		const existingCache = compiledKeywordCache.get(keywords);
		return {
			total: keywords.length,
			compiled: existingCache.size,
			failed: keywords.length - existingCache.size,
			cached: true,
		};
	}

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
	compiledKeywordCache.set(keywords, cache);

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
	const cache = compiledKeywordCache.get(keywords);
	if (!cache) {
		return null;
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

	// ETV filtering defined, need to satisfy it
	const etvMinOk = word.etv_min === "" || (etv_max !== null && etv_max !== "" && etv_max >= parseFloat(word.etv_min));

	const etvMaxOk = word.etv_max === "" || (etv_min !== null && etv_min !== "" && etv_min <= parseFloat(word.etv_max));

	return etvMinOk && etvMaxOk;
}

function keywordMatchReturnFullObject(keywords, title, etv_min = null, etv_max = null) {
	// Automatically pre-compile keywords if not already done
	// This ensures optimal performance without requiring explicit pre-compilation
	if (!compiledKeywordCache.has(keywords) && keywords.length > 0) {
		const stats = precompileKeywords(keywords);
		// Log automatic pre-compilation if not in test environment
		if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
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

	let found = keywords.find((word, index) => {
		let compiled = getCompiledRegex(keywords, index);

		// This should rarely happen now since we pre-compile above
		// But keep as a safety fallback
		if (!compiled) {
			compiled = compileKeyword(word);
			if (!compiled) {
				return false;
			}
		}

		return testKeywordMatch(word, compiled, title, etv_min, etv_max);
	});

	return found;
}

function keywordMatch(keywords, title, etv_min = null, etv_max = null) {
	let found = keywordMatchReturnFullObject(keywords, title, etv_min, etv_max);

	if (typeof found === "object") {
		found = found.contains;
	}
	return found === undefined ? false : found;
}

export { keywordMatch, keywordMatchReturnFullObject, precompileKeywords };
