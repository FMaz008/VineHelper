/**
 * @fileoverview KeywordMatcher - Pure functions for matching text against compiled keyword patterns
 *
 * This module provides stateless matching functions that work with pre-compiled
 * keyword patterns from KeywordCompiler. It handles various matching scenarios
 * including simple contains, exclusion (without), and ETV (Estimated Time Value) conditions.
 *
 * Key principles:
 * - Pure functions with no side effects
 * - Works with pre-compiled patterns for efficiency
 * - No caching or state management
 * - Simple, predictable behavior
 */

/**
 * Tests if a text matches a single regex pattern
 * @param {string} text - The text to test
 * @param {RegExp} pattern - The compiled regex pattern
 * @returns {boolean} True if the text matches the pattern
 */
function matchesPattern(text, pattern) {
	if (!text || !pattern || !(pattern instanceof RegExp)) {
		return false;
	}

	// Reset lastIndex for global regexes to ensure consistent behavior
	pattern.lastIndex = 0;
	return pattern.test(text);
}

/**
 * Tests if a text matches any pattern in an array
 * @param {string} text - The text to test
 * @param {Array<{keyword: string, pattern: RegExp}>} patterns - Array of compiled patterns
 * @returns {boolean} True if the text matches any pattern
 */
function matchesAnyPattern(text, patterns) {
	if (!text || !Array.isArray(patterns)) {
		return false;
	}

	return patterns.some(({ pattern }) => matchesPattern(text, pattern));
}

/**
 * Tests if a text matches all patterns in an array
 * @param {string} text - The text to test
 * @param {Array<{keyword: string, pattern: RegExp}>} patterns - Array of compiled patterns
 * @returns {boolean} True if the text matches all patterns
 */
function matchesAllPatterns(text, patterns) {
	if (!text || !Array.isArray(patterns) || patterns.length === 0) {
		return false;
	}

	return patterns.every(({ pattern }) => matchesPattern(text, pattern));
}

/**
 * Checks if ETV conditions are satisfied
 * @param {Object} keywordObj - The keyword object with etv_min/etv_max
 * @param {number|null} itemEtvMin - The item's minimum ETV
 * @param {number|null} itemEtvMax - The item's maximum ETV
 * @returns {boolean} True if ETV conditions are satisfied or not specified
 */
function satisfiesEtvConditions(keywordObj, itemEtvMin, itemEtvMax) {
	// If no ETV conditions specified, always match
	if (!keywordObj.etv_min && !keywordObj.etv_max) {
		return true;
	}

	// Check minimum ETV condition
	if (keywordObj.etv_min !== undefined && keywordObj.etv_min !== null) {
		if (itemEtvMax === null || itemEtvMax === undefined || itemEtvMax < keywordObj.etv_min) {
			return false;
		}
	}

	// Check maximum ETV condition
	if (keywordObj.etv_max !== undefined && keywordObj.etv_max !== null) {
		if (itemEtvMin === null || itemEtvMin === undefined || itemEtvMin > keywordObj.etv_max) {
			return false;
		}
	}

	return true;
}

/**
 * Matches text against a single compiled keyword object
 * @param {string} text - The text to match against
 * @param {Object} compiledKeyword - Compiled keyword object with patterns
 * @param {number|null} [itemEtvMin=null] - Item's minimum ETV
 * @param {number|null} [itemEtvMax=null] - Item's maximum ETV
 * @returns {boolean} True if the text matches all conditions
 */
function matchKeywordObject(text, compiledKeyword, itemEtvMin = null, itemEtvMax = null) {
	if (!text || !compiledKeyword) {
		return false;
	}

	// Check ETV conditions first (early exit if not satisfied)
	if (!satisfiesEtvConditions(compiledKeyword, itemEtvMin, itemEtvMax)) {
		return false;
	}

	// Check 'contains' conditions
	let containsMatch = false;

	if (compiledKeyword.containsPattern) {
		containsMatch = matchesPattern(text, compiledKeyword.containsPattern);
	} else if (compiledKeyword.containsPatterns) {
		// For array of contains patterns, match if ANY pattern matches
		containsMatch = matchesAnyPattern(text, compiledKeyword.containsPatterns);
	} else if (!compiledKeyword.withoutPattern && !compiledKeyword.withoutPatterns) {
		// If no contains or without patterns, it's not a valid match
		return false;
	} else {
		// If only 'without' patterns exist, consider it a match so far
		containsMatch = true;
	}

	if (!containsMatch) {
		return false;
	}

	// Check 'without' conditions (exclusions)
	if (compiledKeyword.withoutPattern) {
		if (matchesPattern(text, compiledKeyword.withoutPattern)) {
			return false;
		}
	}

	if (compiledKeyword.withoutPatterns) {
		// For array of without patterns, fail if ANY pattern matches
		if (matchesAnyPattern(text, compiledKeyword.withoutPatterns)) {
			return false;
		}
	}
	if (compiledKeyword.withoutPattern) {
		if (matchesPattern(text, compiledKeyword.withoutPattern)) {
			return false;
		}
	}

	if (compiledKeyword.withoutPatterns) {
		// For array of without patterns, fail if ANY pattern matches
		if (matchesAnyPattern(text, compiledKeyword.withoutPatterns)) {
			return false;
		}
	}

	return true;
}

/**
 * Finds the first matching keyword from an array of compiled keywords
 * @param {string} text - The text to match against
 * @param {Array<Object>} compiledKeywords - Array of compiled keyword objects
 * @param {number|null} [itemEtvMin=null] - Item's minimum ETV
 * @param {number|null} [itemEtvMax=null] - Item's maximum ETV
 * @returns {Object|null} The first matching keyword object or null
 */
function findMatch(text, compiledKeywords, itemEtvMin = null, itemEtvMax = null) {
	if (!text || !Array.isArray(compiledKeywords)) {
		return null;
	}

	return compiledKeywords.find((keyword) => matchKeywordObject(text, keyword, itemEtvMin, itemEtvMax)) || null;
}

/**
 * Finds all matching keywords from an array of compiled keywords
 * @param {string} text - The text to match against
 * @param {Array<Object>} compiledKeywords - Array of compiled keyword objects
 * @param {number|null} [itemEtvMin=null] - Item's minimum ETV
 * @param {number|null} [itemEtvMax=null] - Item's maximum ETV
 * @returns {Array<Object>} Array of all matching keyword objects
 */
function findAllMatches(text, compiledKeywords, itemEtvMin = null, itemEtvMax = null) {
	if (!text || !Array.isArray(compiledKeywords)) {
		return [];
	}

	return compiledKeywords.filter((keyword) => matchKeywordObject(text, keyword, itemEtvMin, itemEtvMax));
}

/**
 * Checks if text matches any keyword in the array
 * @param {string} text - The text to match against
 * @param {Array<Object>} compiledKeywords - Array of compiled keyword objects
 * @param {number|null} [itemEtvMin=null] - Item's minimum ETV
 * @param {number|null} [itemEtvMax=null] - Item's maximum ETV
 * @returns {boolean} True if any keyword matches
 */
function hasMatch(text, compiledKeywords, itemEtvMin = null, itemEtvMax = null) {
	return findMatch(text, compiledKeywords, itemEtvMin, itemEtvMax) !== null;
}

/**
 * Legacy compatibility function that returns just the keyword string
 * @param {string} text - The text to match against
 * @param {Array<Object>} compiledKeywords - Array of compiled keyword objects
 * @param {number|null} [itemEtvMin=null] - Item's minimum ETV
 * @param {number|null} [itemEtvMax=null] - Item's maximum ETV
 * @returns {string|false} The matched keyword string or false
 */
function getMatchedKeyword(text, compiledKeywords, itemEtvMin = null, itemEtvMax = null) {
	const match = findMatch(text, compiledKeywords, itemEtvMin, itemEtvMax);

	if (!match) {
		return false;
	}

	// Return the original keyword string for legacy compatibility
	// Priority: contains string > first contains array item > keyword property
	if (typeof match.contains === "string") {
		return match.contains;
	}

	if (Array.isArray(match.contains) && match.contains.length > 0) {
		return match.contains[0];
	}

	if (match.keyword) {
		return match.keyword;
	}

	return false;
}

/**
 * Checks if any keyword in the array has ETV conditions
 * @param {Array<Object>} compiledKeywords - Array of compiled keyword objects
 * @returns {boolean} True if any keyword has ETV conditions
 */
function hasEtvConditions(compiledKeywords) {
	if (!Array.isArray(compiledKeywords)) {
		return false;
	}

	return compiledKeywords.some(
		(keyword) =>
			keyword &&
			((keyword.etv_min !== undefined && keyword.etv_min !== null) ||
				(keyword.etv_max !== undefined && keyword.etv_max !== null))
	);
}

// Export all functions for maximum flexibility
export {
	matchesPattern,
	matchesAnyPattern,
	matchesAllPatterns,
	satisfiesEtvConditions,
	matchKeywordObject,
	findMatch,
	findAllMatches,
	hasMatch,
	getMatchedKeyword,
	hasEtvConditions,
};

// Default export is the main matching function
export default findMatch;
