/**
 * UnifiedTransformHandler - Consolidates multiple transform operations into a single pipeline
 *
 * This addresses the memory profile findings where separate transform handlers were
 * consuming significant memory. By combining them into a single handler, we reduce
 * memory allocation and improve performance.
 */

import { sharedKeywordMatcher } from "../../core/utils/SharedKeywordMatcher.js";
import { Item } from "../../core/models/Item.js";

// Pre-compile regex for search phrase extraction
const SEARCH_PHRASE_REGEX = /^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/;

class UnifiedTransformHandler {
	constructor(settings) {
		this.settings = settings;

		// Cache settings to avoid repeated lookups
		this.cachedSettings = {
			hideKeywords: null,
			highlightKeywords: null,
			blurKeywords: null,
			hideListEnabled: false,
			pushNotifications: false,
			pushNotificationsAFA: false,
		};

		// Initialize cached settings
		this.updateCachedSettings();
	}

	/**
	 * Update cached settings from SettingsMgr
	 */
	updateCachedSettings() {
		this.cachedSettings.hideKeywords = this.settings.get("general.hideKeywords");
		this.cachedSettings.highlightKeywords = this.settings.get("general.highlightKeywords");
		this.cachedSettings.blurKeywords = this.settings.get("general.blurKeywords");
		this.cachedSettings.hideListEnabled = this.settings.get("notification.hideList");
		this.cachedSettings.pushNotifications = this.settings.get("notification.pushNotifications");
		this.cachedSettings.pushNotificationsAFA = this.settings.get("notification.pushNotificationsAFA");
	}

	/**
	 * Combined filter function - returns false if item should be hidden
	 */
	filter(data) {
		// Check if we have required data
		if (!this.hasRequiredEtvData(data)) {
			return true; // Skip filter if missing data
		}

		// Apply hide filter
		if (this.cachedSettings.hideListEnabled && this.cachedSettings.hideKeywords && !data.item.data.KWsMatch) {
			const hideMatch = sharedKeywordMatcher.match(
				this.cachedSettings.hideKeywords,
				data.item.data.title,
				data.item.data.etv_min,
				data.item.data.etv_max,
				"hide",
				this.settings
			);

			if (hideMatch !== undefined) {
				return false; // Hide this item
			}
		}

		return true; // Show this item
	}

	/**
	 * Unified transform function - applies all transformations in sequence
	 */
	transform(data) {
		// Skip if no item data
		if (!data?.item?.data) {
			return data;
		}

		// Apply highlight transform
		if (this.hasRequiredEtvData(data)) {
			const highlightMatch = this.cachedSettings.highlightKeywords
				? sharedKeywordMatcher.match(
						this.cachedSettings.highlightKeywords,
						data.item.data.title,
						data.item.data.etv_min,
						data.item.data.etv_max,
						"highlight",
						this.settings
					)
				: undefined;

			data.item.data.KWsMatch = highlightMatch !== undefined;

			// Debug logging for keyword matching
			if (this.settings.get("general.debugKeywords") && highlightMatch !== undefined) {
				console.log("[UnifiedTransformHandler] Highlight match found:", {
					title: data.item.data.title.substring(0, 100),
					matchedObject: highlightMatch,
					extractedKW: typeof highlightMatch === "object" ? highlightMatch.contains : highlightMatch,
					hasWithout: typeof highlightMatch === "object" && highlightMatch.without ? true : false,
					withoutValue: typeof highlightMatch === "object" ? highlightMatch.without : null,
				});
			}

			// Store the full matched object for debugging
			data.item.data.KWMatchObject = highlightMatch;
			data.item.data.KW =
				highlightMatch !== undefined
					? typeof highlightMatch === "object"
						? highlightMatch.contains
						: highlightMatch
					: "";
		}

		// Apply blur transform
		if (this.hasTitle(data)) {
			const blurMatch = this.cachedSettings.blurKeywords
				? sharedKeywordMatcher.match(
						this.cachedSettings.blurKeywords,
						data.item.data.title,
						null,
						null,
						"blur",
						this.settings
					)
				: undefined;

			data.item.data.BlurKWsMatch = blurMatch !== undefined;
			data.item.data.BlurKW =
				blurMatch !== undefined ? (typeof blurMatch === "object" ? blurMatch.contains : blurMatch) : "";

			// Extract search phrase
			const match = data.item.data.title.match(SEARCH_PHRASE_REGEX);
			data.item.data.search = match ? match[1] : data.item.data.title.substring(0, 40);
		}

		// Apply timestamp transform
		if (data.item.data.date !== undefined) {
			data.item.data.timestamp = this.dateToUnixTimestamp(data.item.data.date);
		}

		// Apply notification transform
		if (data.item.data.asin !== undefined) {
			this.handleNotification(data);
		}

		return data;
	}

	/**
	 * Handle push notification logic
	 */
	handleNotification(data) {
		const KWNotification = this.cachedSettings.pushNotifications && data.item.data.KWsMatch;
		const AFANotification = this.cachedSettings.pushNotificationsAFA && data.item.data.queue === "last_chance";

		if (KWNotification || AFANotification) {
			// Create notification item
			const item = new Item({
				asin: data.item.data.asin,
				queue: data.item.data.queue,
				is_parent_asin: data.item.data.is_parent_asin,
				is_pre_release: data.item.data.is_pre_release,
				enrollment_guid: data.item.data.enrollment_guid,
			});
			item.setTitle(data.item.data.title);
			item.setImgUrl(data.item.data.img_url);
			item.setSearch(data.item.data.search);

			// Debug logging for notification data
			if (!data.item.data.img_url) {
				console.warn("[UnifiedTransformHandler] No image URL in notification data", {
					asin: data.item.data.asin,
					title: data.item.data.title,
					hasImgUrl: !!data.item.data.img_url,
					dataKeys: Object.keys(data.item.data),
				});
			}

			// Store notification data for output handler
			// Use the actual item title for the notification
			data.notification = {
				title:
					data.item.data.title ||
					(KWNotification ? "Vine Helper - New item match KW!" : "Vine Helper - New AFA item"),
				item: item,
			};
		}
	}

	/**
	 * Helper function to check if item has required ETV data
	 */
	hasRequiredEtvData(data) {
		return (
			data.item?.data?.title !== undefined &&
			data.item?.data?.etv_min !== undefined &&
			data.item?.data?.etv_max !== undefined
		);
	}

	/**
	 * Helper function to check if item has title
	 */
	hasTitle(data) {
		return data.item?.data?.title !== undefined;
	}

	/**
	 * Convert date string to Unix timestamp
	 */
	dateToUnixTimestamp(dateString) {
		const date = new Date(dateString + " UTC");
		return Math.floor(date.getTime() / 1000);
	}

	/**
	 * Get memory statistics
	 */
	getStats() {
		return sharedKeywordMatcher.getStats();
	}
}

export { UnifiedTransformHandler };
