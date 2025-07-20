/**
 * @fileoverview KeywordCompiler - Pure functions for compiling keywords into regex patterns
 *
 * This module provides simple, stateless functions for converting keyword strings
 * into compiled regular expression patterns. Each component that needs keyword
 * matching will use these functions to pre-compile their patterns on initialization.
 *
 * Key principles:
 * - Pure functions with no side effects
 * - No caching or state management
 * - Simple, predictable behavior
 * - Components manage their own compiled patterns
 */

/**
 * Checks if a string contains only ASCII characters
 * @param {string} str - The string to check
 * @returns {boolean} True if string contains only ASCII characters
 */
function isAsciiOnly(str) {
	return /^[\x20-\x7E]+$/.test(str);
}

/**
 * Escapes special regex characters in a string
 * @param {string} str - The string to escape
 * @returns {string} The escaped string safe for use in regex
 */
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Creates a regex pattern for a single keyword
 * @param {string} keyword - The keyword to create a pattern for
 * @param {boolean} treatAsRegex - Whether to treat the keyword as a regex pattern (default: true)
 * @returns {string} The regex pattern string
 */
function createKeywordPattern(keyword, treatAsRegex = true) {
	// Original behavior: keywords ARE regex patterns, no escaping by default
	const processedKeyword = treatAsRegex ? keyword : escapeRegex(keyword);

	// Check if this is a pipe-separated pattern (regex alternation)
	if (treatAsRegex && processedKeyword.includes("|")) {
		// Split by pipe and add word boundaries to each alternative
		const alternatives = processedKeyword.split("|").map((alt) => {
			const trimmed = alt.trim();
			if (isAsciiOnly(trimmed)) {
				return `\\b${trimmed}\\b`;
			} else {
				return `(?<![\\w\\p{L}])${trimmed}(?![\\w\\p{L}])`;
			}
		});
		return alternatives.join("|");
	}

	if (isAsciiOnly(keyword)) {
		// For ASCII keywords, use word boundaries
		return `\\b${processedKeyword}\\b`;
	} else {
		// For non-ASCII keywords (e.g., Japanese), use lookahead/lookbehind
		// to ensure we're not matching within a larger word
		return `(?<![\\w\\p{L}])${processedKeyword}(?![\\w\\p{L}])`;
	}
}

/**
 * Compiles a single keyword into a RegExp object
 * @param {string} keyword - The keyword to compile
 * @param {string} [flags='giu'] - Regex flags (default: global, case-insensitive, unicode)
 * @param {boolean} [treatAsRegex=true] - Whether to treat the keyword as a regex pattern
 * @returns {RegExp|null} Compiled RegExp or null if compilation fails
 */
function compileKeyword(keyword, flags = "giu", treatAsRegex = true) {
	if (!keyword || typeof keyword !== "string") {
		return null;
	}

	try {
		const pattern = createKeywordPattern(keyword, treatAsRegex);
		return new RegExp(pattern, flags);
	} catch (e) {
		console.warn(`Failed to compile keyword pattern: ${keyword}`, e);
		return null;
	}
}

/**
 * Compiles an array of keywords into RegExp objects
 * @param {string[]} keywords - Array of keywords to compile
 * @param {string} [flags='giu'] - Regex flags for all patterns
 * @returns {Array<{keyword: string, pattern: RegExp}>} Array of compiled patterns
 */
function compileKeywords(keywords, flags = "giu") {
	if (!Array.isArray(keywords)) {
		return [];
	}

	return keywords
		.filter((keyword) => keyword && typeof keyword === "string")
		.map((keyword) => {
			const pattern = compileKeyword(keyword, flags);
			return pattern ? { keyword, pattern } : null;
		})
		.filter(Boolean);
}

/**
 * Compiles keyword objects with 'contains' and 'without' conditions
 * @param {Array<Object>} keywordObjects - Array of keyword objects
 * @param {string} [flags='giu'] - Regex flags for all patterns
 * @returns {Array<Object>} Array of compiled keyword objects with regex patterns
 */
function compileKeywordObjects(keywordObjects, flags = "giu") {
	if (!Array.isArray(keywordObjects)) {
		return [];
	}

	return keywordObjects
		.filter((obj) => obj && typeof obj === "object")
		.map((obj) => {
			const compiled = { ...obj };

			// Compile 'contains' patterns
			if (obj.contains) {
				if (typeof obj.contains === "string") {
					const pattern = compileKeyword(obj.contains, flags);
					if (pattern) {
						compiled.containsPattern = pattern;
					}
				} else if (Array.isArray(obj.contains)) {
					compiled.containsPatterns = compileKeywords(obj.contains, flags);
				}
			}

			// Compile 'without' patterns
			if (obj.without) {
				if (typeof obj.without === "string") {
					const pattern = compileKeyword(obj.without, flags);
					if (pattern) {
						compiled.withoutPattern = pattern;
					}
				} else if (Array.isArray(obj.without)) {
					compiled.withoutPatterns = compileKeywords(obj.without, flags);
				}
			}

			return compiled;
		});
}

/**
 * Validates and normalizes keyword data into a consistent format
 * @param {*} keywordData - Raw keyword data (can be string, array, or mixed)
 * @returns {Array<Object>} Normalized array of keyword objects
 */
function normalizeKeywordData(keywordData) {
	if (!keywordData) {
		return [];
	}

	// Handle single string
	if (typeof keywordData === "string") {
		return [{ contains: keywordData }];
	}

	// Handle array
	if (Array.isArray(keywordData)) {
		return keywordData
			.map((item) => {
				if (typeof item === "string") {
					return { contains: item };
				}
				return item;
			})
			.filter((item) => item && typeof item === "object");
	}

	// Handle single object
	if (typeof keywordData === "object") {
		return [keywordData];
	}

	return [];
}

/**
 * Main entry point for compiling keyword data
 * @param {*} keywordData - Raw keyword data in any supported format
 * @param {string} [flags='giu'] - Regex flags for all patterns
 * @returns {Array<Object>} Array of compiled keyword objects ready for matching
 */
function compile(keywordData, flags = "giu") {
	const normalized = normalizeKeywordData(keywordData);
	return compileKeywordObjects(normalized, flags);
}

// Export all functions for maximum flexibility
export {
	isAsciiOnly,
	escapeRegex,
	createKeywordPattern,
	compileKeyword,
	compileKeywords,
	compileKeywordObjects,
	normalizeKeywordData,
	compile,
};

// Default export is the main compile function
export default compile;
