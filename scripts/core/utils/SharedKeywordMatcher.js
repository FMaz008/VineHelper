/**
 * SharedKeywordMatcher - A wrapper around the KeywordMatcher singleton
 *
 * This class provides backward compatibility for code that uses SharedKeywordMatcher
 * while delegating all functionality to the KeywordMatcher singleton.
 *
 * The original last-match cache has been removed as analysis showed it was ineffective:
 * - Items flow through the pipeline linearly: hide → highlight → blur
 * - Each check uses a different keywordType, resulting in different cache keys
 * - No item is checked twice with the same parameters in quick succession
 *
 * @deprecated Use keywordMatcher from KeywordMatch.js directly
 */

import { keywordMatcher, clearKeywordCache } from "./KeywordMatch.js";

class SharedKeywordMatcher {
	constructor(settingsMgr = null) {
		// Store settings manager reference
		this.settingsMgr = settingsMgr;

		// Set settings manager on the singleton if provided
		if (settingsMgr) {
			keywordMatcher.setSettingsManager(settingsMgr);
		}

		// For backward compatibility, return existing instance if no settingsMgr
		if (SharedKeywordMatcher.instance && !settingsMgr) {
			return SharedKeywordMatcher.instance;
		}
		if (!settingsMgr) {
			SharedKeywordMatcher.instance = this;
		}
	}

	/**
	 * Match keywords using the KeywordMatcher singleton
	 * @param {Array} keywords - Array of keywords to match
	 * @param {string} title - Title to match against
	 * @param {*} etv_min - Minimum ETV value
	 * @param {*} etv_max - Maximum ETV value
	 * @param {string} keywordType - Type of keywords (hide/highlight/blur) - unused but kept for compatibility
	 * @param {Object} settingsMgr - Optional settings manager to use pre-compiled keywords
	 * @returns {*} Matched keyword object or undefined
	 */
	match(keywords, title, etv_min = null, etv_max = null, keywordType = "unknown", settingsMgr = null) {
		if (!keywords || keywords.length === 0 || !title) {
			return undefined;
		}

		// Use the provided settings manager or the instance one
		const effectiveSettingsMgr = settingsMgr || this.settingsMgr;

		// Delegate to the singleton
		return keywordMatcher.keywordMatchReturnFullObject(keywords, title, etv_min, etv_max, effectiveSettingsMgr);
	}

	/**
	 * Clear caches - delegates to the singleton
	 */
	clearCache() {
		clearKeywordCache();
		console.log(`[SharedKeywordMatcher] Cache cleared (delegated to KeywordMatcher singleton)`);
	}

	/**
	 * Get statistics - delegates to the singleton
	 */
	getStats() {
		return keywordMatcher.getStats();
	}
}

// Export singleton instance for backward compatibility
export const sharedKeywordMatcher = new SharedKeywordMatcher();
