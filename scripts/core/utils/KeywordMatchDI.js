/**
 * KeywordMatchDI - Enhanced keyword matching with DI support
 *
 * This module provides keyword matching functionality that can work with
 * the KeywordCompilationService for shared compilation across contexts.
 * It maintains backward compatibility with the existing KeywordMatch API.
 */

import {
	keywordMatch as originalKeywordMatch,
	keywordMatchReturnFullObject as originalKeywordMatchReturnFullObject,
	precompileKeywords as originalPrecompileKeywords,
	compileKeyword,
	createRegexPattern,
} from "./KeywordMatch.js";
import { hasEtvCondition } from "./KeywordUtils.js";

// Global reference to the compilation service (set via DI)
let compilationService = null;

// Local cache for when service is not available
const localCompiledCache = new WeakMap();

/**
 * Set the compilation service instance
 * @param {KeywordCompilationService} service - The compilation service
 */
export function setCompilationService(service) {
	compilationService = service;
}

/**
 * Get compiled keywords from service or local cache
 * @private
 */
async function getCompiledKeywords(type, keywords) {
	// Try to use the compilation service first
	if (compilationService) {
		try {
			const compiled = await compilationService.getCompiled(type, keywords);
			if (compiled) {
				return compiled;
			}

			// If not found in service, compile and share
			await compilationService.compileAndShare(type, keywords);
			return await compilationService.getCompiled(type, keywords);
		} catch (error) {
			console.warn(`[KeywordMatchDI] Failed to use compilation service: ${error.message}`);
		}
	}

	// Fallback to local compilation
	if (!localCompiledCache.has(keywords)) {
		const stats = originalPrecompileKeywords(keywords);
		// Store the compiled cache locally
		const cache = new Map();
		keywords.forEach((word, index) => {
			const compiled = compileKeyword(word);
			if (compiled) {
				// Add ETV condition flag using shared utility
				if (hasEtvCondition(word)) {
					compiled.hasEtvCondition = true;
				}
				cache.set(index, compiled);
			}
		});
		localCompiledCache.set(keywords, cache);
	}

	return localCompiledCache.get(keywords);
}

/**
 * Enhanced keyword match that uses shared compilation
 * @param {Array} keywords - The keywords to match
 * @param {string} title - The title to test
 * @param {*} etv_min - Minimum ETV value
 * @param {*} etv_max - Maximum ETV value
 * @param {string} type - Keyword type (highlight, hide, blur)
 * @returns {string|boolean} The matched keyword or false
 */
export async function keywordMatchDI(keywords, title, etv_min = null, etv_max = null, type = "unknown") {
	const found = await keywordMatchReturnFullObjectDI(keywords, title, etv_min, etv_max, type);

	if (typeof found === "object") {
		return found.contains;
	}
	return found === undefined ? false : found;
}

/**
 * Enhanced keyword match that returns full object
 * @param {Array} keywords - The keywords to match
 * @param {string} title - The title to test
 * @param {*} etv_min - Minimum ETV value
 * @param {*} etv_max - Maximum ETV value
 * @param {string} type - Keyword type (highlight, hide, blur)
 * @returns {object|undefined} The matched keyword object or undefined
 */
export async function keywordMatchReturnFullObjectDI(
	keywords,
	title,
	etv_min = null,
	etv_max = null,
	type = "unknown"
) {
	if (!keywords || keywords.length === 0) {
		return undefined;
	}

	// Get compiled keywords (from service or local cache)
	const compiledCache = await getCompiledKeywords(type, keywords);

	if (!compiledCache) {
		// Fallback to original implementation
		return originalKeywordMatchReturnFullObject(keywords, title, etv_min, etv_max);
	}

	// Find matching keyword
	const found = keywords.find((word, index) => {
		const compiled = compiledCache.get(index);
		if (!compiled) {
			return false;
		}

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
		const etvMinOk =
			word.etv_min === "" || (etv_max !== null && etv_max !== "" && etv_max >= parseFloat(word.etv_min));
		const etvMaxOk =
			word.etv_max === "" || (etv_min !== null && etv_min !== "" && etv_min <= parseFloat(word.etv_max));

		return etvMinOk && etvMaxOk;
	});

	return found;
}

/**
 * Pre-compile keywords using the compilation service
 * @param {Array} keywords - The keywords to compile
 * @param {string} type - Keyword type (highlight, hide, blur)
 * @returns {Promise<Object>} Compilation stats
 */
export async function precompileKeywordsDI(keywords, type = "unknown") {
	if (compilationService) {
		try {
			return await compilationService.compileAndShare(type, keywords);
		} catch (error) {
			console.warn(`[KeywordMatchDI] Failed to use compilation service: ${error.message}`);
		}
	}

	// Fallback to original implementation
	return originalPrecompileKeywords(keywords);
}

/**
 * Check if any keywords have ETV conditions
 * @param {Array} keywords - The keywords to check
 * @param {string} type - Keyword type
 * @returns {Promise<boolean>} True if any keyword has ETV conditions
 */
export async function hasAnyEtvConditionsDI(keywords, type = "unknown") {
	if (!keywords || keywords.length === 0) {
		return false;
	}

	const compiledCache = await getCompiledKeywords(type, keywords);

	if (!compiledCache) {
		// Fallback: check keywords directly using shared utility
		return keywords.some(hasEtvCondition);
	}

	// Check compiled cache for ETV conditions
	for (const [index, compiled] of compiledCache) {
		if (compiled.hasEtvCondition) {
			return true;
		}
	}

	return false;
}

/**
 * Synchronous versions that use local cache only (for backward compatibility)
 */
export function keywordMatch(keywords, title, etv_min = null, etv_max = null) {
	return originalKeywordMatch(keywords, title, etv_min, etv_max);
}

export function keywordMatchReturnFullObject(keywords, title, etv_min = null, etv_max = null) {
	return originalKeywordMatchReturnFullObject(keywords, title, etv_min, etv_max);
}

export function precompileKeywords(keywords) {
	return originalPrecompileKeywords(keywords);
}

/**
 * Export additional utilities
 */
export { compileKeyword, createRegexPattern };
