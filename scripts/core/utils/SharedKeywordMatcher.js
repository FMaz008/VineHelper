/**
 * SharedKeywordMatcher - A memory-optimized keyword matching service
 *
 * This class provides a centralized keyword matching service that leverages
 * the existing KeywordMatch caching infrastructure while adding result caching
 * to further reduce memory usage and improve performance.
 *
 * Architecture:
 * - KeywordMatch.js: Core regex compilation and caching (WeakMap + counter)
 * - SharedKeywordMatcher.js: Runtime matching with last-match optimization
 * - Keywords are pre-compiled when saved in settings for optimal performance
 *
 * Both modules share the same underlying cache from KeywordMatch.js
 *
 * Key learnings from past implementations:
 * - WeakMap doesn't work for caching because Settings.get() returns new array references
 * - The existing KeywordMatch.js already has optimized caching with counter-based keys
 * - We should leverage that instead of reimplementing caching
 */

import { keywordMatchReturnFullObject, clearKeywordCache } from "./KeywordMatch.js";

class SharedKeywordMatcher {
	constructor(settingsMgr = null) {
		// Track match statistics
		this.stats = {
			totalMatches: 0,
			cacheClears: 0
		};
		
		// Track last match results per keyword type to avoid redundant calls
		// This is a simple optimization for repeated checks with same inputs
		this.lastMatchCache = new Map();
		
		// Store settings manager reference
		this.settingsMgr = settingsMgr;
		
		// Singleton instance - but allow different settings managers
		if (SharedKeywordMatcher.instance && !settingsMgr) {
			return SharedKeywordMatcher.instance;
		}
		if (!settingsMgr) {
			SharedKeywordMatcher.instance = this;
		}
	}

	/**
	 * Generate a simple cache key for last match tracking
	 * This is just for avoiding immediate re-checks, not long-term caching
	 */
	#generateLastMatchKey(title, keywordType) {
		// Simple key - just type and title (truncated)
		return `${keywordType}:${title.substring(0, 50)}`;
	}

	/**
	 * Match keywords using the existing optimized KeywordMatch implementation
	 * @param {Array} keywords - Array of keywords to match
	 * @param {string} title - Title to match against
	 * @param {*} etv_min - Minimum ETV value
	 * @param {*} etv_max - Maximum ETV value
	 * @param {string} keywordType - Type of keywords (hide/highlight/blur)
	 * @param {Object} settingsMgr - Optional settings manager to use pre-compiled keywords
	 * @returns {*} Matched keyword object or undefined
	 */
	match(keywords, title, etv_min = null, etv_max = null, keywordType = 'unknown', settingsMgr = null) {
		if (!keywords || keywords.length === 0 || !title) {
			return undefined;
		}

		this.stats.totalMatches++;

		// Check if this is the exact same match as the last one
		const lastMatchKey = this.#generateLastMatchKey(title, keywordType);
		const lastMatch = this.lastMatchCache.get(lastMatchKey);
		
		if (lastMatch &&
			lastMatch.etv_min === etv_min &&
			lastMatch.etv_max === etv_max &&
			lastMatch.keywordsLength === keywords.length) {
			// Return cached result for identical consecutive calls
			return lastMatch.result;
		}

		// Use the existing optimized keyword matching
		// Pass settings manager to use pre-compiled keywords when available
		const effectiveSettingsMgr = settingsMgr || this.settingsMgr;
		const result = keywordMatchReturnFullObject(keywords, title, etv_min, etv_max, effectiveSettingsMgr);
		
		// Cache this result for potential immediate re-use
		this.lastMatchCache.set(lastMatchKey, {
			result,
			etv_min,
			etv_max,
			keywordsLength: keywords.length
		});
		
		// Keep last match cache small (only most recent matches)
		if (this.lastMatchCache.size > 100) {
			// Remove oldest entries
			const keysToDelete = Array.from(this.lastMatchCache.keys()).slice(0, 50);
			keysToDelete.forEach(key => this.lastMatchCache.delete(key));
		}

		return result;
	}

	/**
	 * Clear caches - both our last match cache and the underlying keyword cache
	 */
	clearCache() {
		this.lastMatchCache.clear();
		clearKeywordCache(); // Clear the underlying KeywordMatch cache
		this.stats.cacheClears++;
		console.log(`[SharedKeywordMatcher] Caches cleared. Stats: ${JSON.stringify(this.stats)}`);
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return {
			...this.stats,
			lastMatchCacheSize: this.lastMatchCache.size
		};
	}

	// precompileAll method removed - keywords are now pre-compiled when saved in settings
}

// Export singleton instance
export const sharedKeywordMatcher = new SharedKeywordMatcher();