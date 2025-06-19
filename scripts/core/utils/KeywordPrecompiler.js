import { precompileKeywords } from "./KeywordMatch.js";

/**
 * Pre-compiles all keyword types from settings
 * @param {object} settings - Settings object with get method
 * @param {string} context - Context name for logging (e.g., "NotificationMonitorV3")
 */
export function precompileAllKeywords(settings, context) {
	const keywordTypes = [
		{ key: "general.highlightKeywords", name: "highlight" },
		{ key: "general.hideKeywords", name: "hide" },
		{ key: "general.blurKeywords", name: "blur" },
	];

	keywordTypes.forEach(({ key, name }) => {
		const keywords = settings.get(key) || [];
		if (keywords.length > 0) {
			const stats = precompileKeywords(keywords);
			// Only log if not in test environment
			if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
				const cacheStatus = stats.cached ? " (from cache)" : "";
				if (stats.failed > 0) {
					console.log(
						`[${context}] Pre-compiled ${stats.compiled}/${stats.total} ${name} keywords${cacheStatus} (${stats.failed} failed)`
					);
				} else {
					console.log(`[${context}] Pre-compiled ${stats.compiled} ${name} keywords${cacheStatus}`);
				}
			}
		}
	});
}
