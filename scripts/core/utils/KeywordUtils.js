/**
 * Shared utility functions for keyword processing
 */

/**
 * Check if a keyword has ETV conditions
 * @param {string|object} keyword - The keyword to check
 * @returns {boolean} True if the keyword has ETV conditions
 */
export function hasEtvCondition(keyword) {
	return typeof keyword === "object" && (keyword.etv_min || keyword.etv_max);
}

/**
 * Check if ETV minimum condition is satisfied
 * @param {string} keywordEtvMin - The keyword's minimum ETV requirement
 * @param {*} itemEtvMax - The item's maximum ETV value
 * @returns {boolean} True if the condition is satisfied
 */
export function isEtvMinSatisfied(keywordEtvMin, itemEtvMax) {
	if (!keywordEtvMin || keywordEtvMin === "") return true;
	if (itemEtvMax === null || itemEtvMax === "") return false;
	return itemEtvMax >= parseFloat(keywordEtvMin);
}

/**
 * Check if ETV maximum condition is satisfied
 * @param {string} keywordEtvMax - The keyword's maximum ETV requirement
 * @param {*} itemEtvMin - The item's minimum ETV value
 * @returns {boolean} True if the condition is satisfied
 */
export function isEtvMaxSatisfied(keywordEtvMax, itemEtvMin) {
	if (!keywordEtvMax || keywordEtvMax === "") return true;
	if (itemEtvMin === null || itemEtvMin === "") return false;
	return itemEtvMin <= parseFloat(keywordEtvMax);
}

/**
 * Check if both ETV conditions are satisfied
 * @param {object} keyword - The keyword object with etv_min and etv_max
 * @param {*} itemEtvMin - The item's minimum ETV value
 * @param {*} itemEtvMax - The item's maximum ETV value
 * @returns {boolean} True if both conditions are satisfied
 */
export function areEtvConditionsSatisfied(keyword, itemEtvMin, itemEtvMax) {
	return isEtvMinSatisfied(keyword.etv_min, itemEtvMax) && isEtvMaxSatisfied(keyword.etv_max, itemEtvMin);
}

// Constants for better code clarity
export const ETV_REPOSITION_THRESHOLD = 0.01; // Minimum ETV change to trigger repositioning

// FNV-1a hash constants for better hash distribution
export const FNV_OFFSET_BASIS = 2166136261;
export const FNV_PRIME = 16777619;

/**
 * Generate a hash using FNV-1a algorithm
 * @param {string} str - The string to hash
 * @returns {number} The hash value
 */
export function fnv1aHash(str) {
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = (hash * FNV_PRIME) >>> 0;
	}
	return hash;
}
