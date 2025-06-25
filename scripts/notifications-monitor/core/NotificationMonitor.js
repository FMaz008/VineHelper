/*global chrome*/

//Todo: insertTileAccordingToETV and ETVChangeRepositioning are very similar. Could we merge some logic?

// Tile import kept for future use
// eslint-disable-next-line no-unused-vars
import { Tile } from "/scripts/ui/components/Tile.js";

import { YMDHiStoISODate } from "/scripts/core/utils/DateHelper.js";
import { keywordMatch, hasAnyEtvConditions } from "/scripts/core/utils/KeywordMatch.js";
import { ETV_REPOSITION_THRESHOLD } from "/scripts/core/utils/KeywordUtils.js";
import { escapeHTML, unescapeHTML, removeSpecialHTML } from "/scripts/core/utils/StringHelper.js";
import { MonitorCore } from "/scripts/notifications-monitor/core/MonitorCore.js";
import { Item } from "/scripts/core/models/Item.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

// Memory debugging - will be initialized if debug mode is enabled
let MemoryDebugger = null;
let memoryDebuggerInitialized = false;

// Create a promise that will be resolved when we check for debug mode
window.MEMORY_DEBUGGER_READY = new Promise((resolve) => {
	// This will be resolved when NotificationMonitor is initialized
	window._resolveMemoryDebuggerReady = resolve;
});

// Also create a simple getter function that works after page load
window.getMemoryDebugger = function () {
	if (window.MEMORY_DEBUGGER) {
		return window.MEMORY_DEBUGGER;
	}
	console.log(
		'Memory debugger not available. Enable with: localStorage.setItem("vh_debug_memory", "true") and reload'
	);
	return null;
};

//const TYPE_SHOW_ALL = -1;
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;
const TYPE_UNKNOWN_ETV = 3;
const TYPE_HIGHLIGHT_OR_ZEROETV = 9;

const TYPE_DATE_ASC = "date_asc";
const TYPE_DATE_DESC = "date_desc";
const TYPE_PRICE_DESC = "price_desc";
const TYPE_PRICE_ASC = "price_asc";

class NotificationMonitor extends MonitorCore {
	_feedPaused = false;
	#pausedByMouseoverSeeDetails = false;
	_feedPausedAmountStored = 0;
	_fetchingRecentItems;
	_fetchTimeout = null; // Timeout for fetch operations
	_gridContainer = null;
	_bulkSoundPending = false; // Track if we need to play a bulk sound
	_bulkSoundTypes = new Set(); // Track types of items found during bulk fetch
	_gridContainerWidth = 0;
	_wsErrorMessage = null;
	_mostRecentItemDate = null;
	_mostRecentItemDateDOM = null;
	_itemTemplateFile = "tile_gridview.html";
	_searchText = ""; // Current search text
	_searchDebounceTimer = null; // Timer for debouncing search
	_autoTruncateDebounceTimer = null; // Timer for debouncing autoTruncate
	_ctrlPress = false;
	// UI User settings (will be loaded from storage)
	_autoTruncateEnabled = true;
	_filterQueue = -1;
	_filterType = -1;
	_sortType = TYPE_DATE_DESC;
	_noShiftGrid = null;
	_gridEventManager = null;
	_visibilityStateManager = null;

	#pinDebounceTimer = null;
	#pinDebounceClickable = true;

	// Track items currently being processed for ETV to prevent duplicate processing
	#etvProcessingItems = new Set();


	// Track items currently being processed for visibility to prevent concurrent updates
	#visibilityProcessingItems = new Set();

	// Store event handler references for cleanup
	#eventHandlers = {
		grid: null,
		document: null,
		window: {
			keydown: null,
			keyup: null,
			scroll: null,
		},
		buttons: new Map(),
	};

	constructor(monitorV3 = false) {
		super(monitorV3);

		// Prevent direct instantiation of the abstract class
		if (this.constructor === NotificationMonitor) {
			throw new TypeError('Abstract class "NotificationMonitor" cannot be instantiated directly.');
		}

		// Add unhandled rejection handler to prevent master crashes
		this._setupErrorHandlers();

		// Initialize memory debugger if enabled in settings
		this._initializeMemoryDebugger();

		// Listen for immediate count changes to update pause button
		if (this._hookMgr) {
			this._hookMgr.hookBind("visibility:count-changed-immediate", (data) => {
				// Only update pause button count if feed is paused
				if (this._feedPaused) {
					this._feedPausedAmountStored = data.count;
					this.#updatePauseButtonCount(data.count);
				}
			});
		}
	}

	/**
	 * Setup error handlers to prevent crashes
	 * @private
	 */
	_setupErrorHandlers() {
		// Store reference to this instance
		const monitor = this;

		// Only set up handlers once per window
		if (!window._vhErrorHandlersSetup) {
			window._vhErrorHandlersSetup = true;

			// Handle unhandled promise rejections
			window.addEventListener("unhandledrejection", (event) => {
				console.error("Unhandled promise rejection in NotificationMonitor:", event.reason);

				// If we're fetching recent items and an error occurs, clean up the state
				if (monitor._fetchingRecentItems) {
					console.error("Error occurred during fetch operation, cleaning up state");
					monitor.fetchRecentItemsEnd();
				}

				// Prevent the default handler from running
				event.preventDefault();
			});

			// Handle general errors
			window.addEventListener("error", (event) => {
				console.error("Global error in NotificationMonitor:", event.error);

				// If we're fetching recent items and an error occurs, clean up the state
				if (monitor._fetchingRecentItems) {
					console.error("Error occurred during fetch operation, cleaning up state");
					monitor.fetchRecentItemsEnd();
				}
			});
		}
	}

	/**
	 * Initialize the memory debugger if enabled in settings
	 * @private
	 */
	async _initializeMemoryDebugger() {
		// Wait for settings to load
		await this._settings.waitForLoad();

		// Check if memory debugging is enabled
		const debugMemoryEnabled = this._settings.get("general.debugMemory") === true;

		if (debugMemoryEnabled && !memoryDebuggerInitialized) {
			memoryDebuggerInitialized = true;

			try {
				// Dynamically import the memory debugger
				const module = await import("/scripts/notifications-monitor/debug/MemoryDebugger.js");
				MemoryDebugger = module.default || module.MemoryDebugger || module;
				console.log("🔍 Memory Debugger loaded. Use window.MEMORY_DEBUGGER to access."); // eslint-disable-line no-console

				// Create the global instance
				if (!window.MEMORY_DEBUGGER && MemoryDebugger) {
					const debuggerInstance = new MemoryDebugger();

					// Store the debugger instance
					window.MEMORY_DEBUGGER = debuggerInstance;

					console.log("🔍 Memory Debugger initialized. Starting monitoring..."); // eslint-disable-line no-console

					// Create global API that can be accessed from console
					window.VH_MEMORY = {
						takeSnapshot: (name) => {
							if (debuggerInstance) {
								return debuggerInstance.takeSnapshot(name);
							}
							console.error("Memory debugger not available");
							return null;
						},
						generateReport: () => {
							if (debuggerInstance) {
								return debuggerInstance.generateReport();
							}
							console.error("Memory debugger not available");
							return null;
						},
						detectLeaks: () => {
							if (debuggerInstance) {
								return debuggerInstance.detectLeaks();
							}
							console.error("Memory debugger not available");
							return null;
						},
						checkDetachedNodes: () => {
							if (debuggerInstance) {
								return debuggerInstance.checkDetachedNodes();
							}
							console.error("Memory debugger not available");
							return null;
						},
						cleanup: () => {
							if (debuggerInstance) {
								return debuggerInstance.cleanup();
							}
							console.error("Memory debugger not available");
							return null;
						},
						stopMonitoring: () => {
							if (debuggerInstance) {
								return debuggerInstance.stopMonitoring();
							}
							console.error("Memory debugger not available"); // eslint-disable-line no-console
							return null;
						},
					};

					// Make it available globally
					globalThis.VH_MEMORY = window.VH_MEMORY;

					console.log("📊 Memory Debugger API available at window.VH_MEMORY"); // eslint-disable-line no-console
					console.log("Available methods:"); // eslint-disable-line no-console
					console.log("  - VH_MEMORY.takeSnapshot(name)"); // eslint-disable-line no-console
					console.log("  - VH_MEMORY.generateReport()"); // eslint-disable-line no-console
					console.log("  - VH_MEMORY.detectLeaks()"); // eslint-disable-line no-console
					console.log("  - VH_MEMORY.checkDetachedNodes()"); // eslint-disable-line no-console
					console.log("  - VH_MEMORY.cleanup()"); // eslint-disable-line no-console
					console.log("  - VH_MEMORY.stopMonitoring()"); // eslint-disable-line no-console

					// Resolve the promise
					if (window._resolveMemoryDebuggerReady) {
						window._resolveMemoryDebuggerReady(debuggerInstance);
					}
				}
			} catch (error) {
				console.error("Failed to initialize MemoryDebugger:", error); // eslint-disable-line no-console
				if (window._resolveMemoryDebuggerReady) {
					window._resolveMemoryDebuggerReady(null);
				}
			}
		} else {
			// Resolve the promise with null if not enabled
			if (window._resolveMemoryDebuggerReady) {
				window._resolveMemoryDebuggerReady(null);
			}
		}
	}

	/**
	 * Emit a grid event if GridEventManager is available
	 * @private
	 * @param {string} eventName - The event name
	 * @param {Object} data - Optional event data
	 */
	#emitGridEvent(eventName, data = null) {
		if (this._gridEventManager) {
			this._gridEventManager.emitGridEvent(eventName, data);
		}
	}

	//###################################################################
	// DOM element related methods
	//###################################################################

	/**
	 * Get the appropriate display style for tiles based on monitor version
	 * @returns {string} - "block" for V2, "flex" for V3
	 */
	#getTileDisplayStyle() {
		return this._monitorV2 ? "block" : "flex";
	}

	/**
	 * Set element visibility using VisibilityStateManager for V3 or direct style for V2
	 * @param {HTMLElement} element - The element to update
	 * @param {boolean} visible - Whether the element should be visible
	 * @param {string} displayStyle - The display style to use when visible
	 */
	#setElementVisibility(element, visible, displayStyle = null) {
		if (this._visibilityStateManager && this._visibilityStateManager.setVisibility) {
			// V3 with VisibilityStateManager
			this._visibilityStateManager.setVisibility(element, visible, displayStyle || this.#getTileDisplayStyle());
		} else {
			// V2 fallback - set style directly
			element.style.display = visible ? displayStyle || this.#getTileDisplayStyle() : "none";
		}
	}

	/**
	 * Check if an element is visible
	 * @param {HTMLElement} element - The element to check
	 * @returns {boolean} - True if the element is visible, false otherwise
	 */
	#isElementVisible(element) {
		// Delegate to VisibilityStateManager for V3, fall back to direct check for V2
		if (this._visibilityStateManager && this._visibilityStateManager.isVisible) {
			return this._visibilityStateManager.isVisible(element);
		}

		// Fallback for V2 or if VisibilityStateManager is not available
		if (!element) return false;
		const style = window.getComputedStyle(element);
		return style.display !== "none";
	}

	/**
	 * Clear the computed style cache when styles might have changed
	 * Call this when filters change or bulk style operations occur
	 */
	#invalidateComputedStyleCache() {
		// Delegate to VisibilityStateManager for V3
		if (this._visibilityStateManager && this._visibilityStateManager.clearCache) {
			this._visibilityStateManager.clearCache();
		}
		// No cache to clear for V2 since we removed #computedStyleCache
	}

	/**
	 * Check if an element's visibility would change based on current filters
	 * without actually applying the change. This prevents redundant processing.
	 * @param {HTMLElement} element - The element to check
	 * @returns {boolean} - True if visibility would change, false otherwise
	 */
	#wouldVisibilityChange(element) {
		if (!element) return false;

		const currentlyVisible = this.#isElementVisible(element);
		const shouldBeVisible = this.#calculateNodeVisibility(element);

		return currentlyVisible !== shouldBeVisible;
	}

	/**
	 * Handle visibility change detection and emit appropriate grid events
	 * @param {HTMLElement} element - The element to check and process
	 * @param {boolean} wasVisible - The visibility state before the change
	 */
	#handleVisibilityChange(element, wasVisible) {
		// ISSUE #2 FIX: Re-apply filtering when unknown ETV flag changes
		// This ensures items are properly removed when their ETV becomes known

		if (this._visibilityStateManager) {
			// For V3, we need to re-apply filtering to handle unknown ETV changes
			// The unknown ETV flag might have changed, requiring re-filtering
			const asin = element.dataset?.asin;
			const debugNotifications = Settings.get("general.debugNotifications");

			if (debugNotifications && asin) {
				console.log("[NotificationMonitor] handleVisibilityChange called for V3", {
					asin,
					wasVisible,
					typeUnknownETV: element.dataset.typeUnknownETV,
					currentFilter: this._filterType,
					stackTrace: new Error().stack,
				});
			}

			// Re-apply filtering to handle unknown ETV changes
			const isNowVisible = this.#processNotificationFiltering(element);

			// The VisibilityStateManager will handle count updates through setVisibility
			// called within processNotificationFiltering

			if (debugNotifications && asin) {
				console.log("[NotificationMonitor] handleVisibilityChange result", {
					asin,
					wasVisible,
					isNowVisible,
					visibilityChanged: wasVisible !== isNowVisible,
				});
			}

			return isNowVisible;
		}

		// V2 fallback - re-apply filtering and check if visibility changed
		const isNowVisible = this.#processNotificationFiltering(element);

		// Emit grid event if visibility changed
		if (wasVisible !== isNowVisible) {
			this.#emitGridEvent(isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
		}

		return isNowVisible;
	}

	/**
	 * Update visible count after filtering and emit appropriate events
	 */
	#updateVisibleCountAfterFiltering() {
		// For filter operations, update immediately to prevent placeholder bounce
		// The DOM is already updated by applyFilteringToAllItems

		const debugBulkOperations = this._settings.get("general.debugBulkOperations");
		if (debugBulkOperations) {
			console.log("[updateVisibleCountAfterFiltering] Starting filter count update");
		}

		// Invalidate computed style cache after bulk filtering
		// This prevents stale cached values after style changes
		this.#invalidateComputedStyleCache();

		// Force a reflow to ensure styles are applied
		void this._gridContainer.offsetHeight;

		// Get the count after filtering
		let newCount;
		if (this._visibilityStateManager) {
			// V3 with VisibilityStateManager - batchSetVisibility already updated the count
			// No need to recalculate as it would clear caches and force visibility checks on all elements
			newCount = this._visibilityStateManager.getCount();

			if (debugBulkOperations) {
				console.log("[updateVisibleCountAfterFiltering] Using count from VisibilityStateManager:", newCount);
				console.log(
					"[updateVisibleCountAfterFiltering] Skipping recalculateCount - batchSetVisibility already updated count accurately"
				);
			}
		} else {
			// V2 fallback - count directly
			newCount = this._countVisibleItems();
			// Update the visibility state manager with new count (V3 only)
			this._visibilityStateManager?.setCount(newCount);
		}

		// Update tab title
		this._updateTabTitle(newCount);
		// Emit event for filter change with visible count
		// The GridEventManager will handle placeholder updates via this event
		this.#emitGridEvent("grid:items-filtered", { visibleCount: newCount });
	}

	/**
	 * Determine if the item should be displayed based on the filters settings. Will hide the item if it doesn't match the filters.
	 * @param {object} node - The DOM element of the tile
	 * @returns {boolean} - Doesn't mean anything.
	 */
	#processNotificationFiltering(node) {
		if (!node) {
			return false;
		}

		const asin = node.dataset?.asin || "unknown";

		// OPTIMIZATION: Prevent concurrent processing of the same item
		// This helps reduce redundant visibility updates
		if (this.#visibilityProcessingItems.has(asin)) {
			if (this._settings.get("general.debugTabTitle")) {
				console.log(`[NotificationMonitor] Skipping concurrent processing for ${asin}`);
			}
			return this.#isElementVisible(node);
		}

		// OPTIMIZATION: Early exit if visibility wouldn't change
		// This prevents unnecessary processing of filter logic
		if (!this.#wouldVisibilityChange(node)) {
			// Track early exits without verbose logging
			if (!this._earlyExitCount) {
				this._earlyExitCount = new Map();
			}
			this._earlyExitCount.set(asin, (this._earlyExitCount.get(asin) || 0) + 1);

			// Only log periodically or when debugging specific items
			if (
				this._settings.get("general.debugTabTitle") &&
				(this._earlyExitCount.get(asin) === 1 || this._earlyExitCount.get(asin) % 10 === 0)
			) {
				console.log(`[NotificationMonitor] Early exit for ${asin} (count: ${this._earlyExitCount.get(asin)})`);
			}

			return this.#isElementVisible(node);
		}

		// Mark as processing
		this.#visibilityProcessingItems.add(asin);

		try {
			// Debug: Track call source
			if (this._settings.get("general.debugTabTitle") || window.DEBUG_VISIBILITY_STATE) {
				const stack = new Error().stack;
				const caller = stack.split("\n")[2]?.trim() || "unknown caller";

				if (!this._filterCallTracking) {
					this._filterCallTracking = new Map();
				}

				const key = `${asin}-${Date.now()}`;
				this._filterCallTracking.set(key, {
					asin,
					caller,
					timestamp: Date.now(),
				});

				// Log if we see multiple calls for same item within 100ms
				const recentCalls = Array.from(this._filterCallTracking.entries()).filter(
					([k, v]) => v.asin === asin && Date.now() - v.timestamp < 100
				);

				if (recentCalls.length > 1) {
					console.warn(`[NotificationMonitor] Multiple processNotificationFiltering calls for ${asin}:`, {
						callCount: recentCalls.length,
						callers: recentCalls.map(([k, v]) => v.caller),
						timeDiffs: recentCalls.map(([k, v]) => Date.now() - v.timestamp),
					});
				}

				// Clean up old entries
				if (this._filterCallTracking.size > 100) {
					const cutoff = Date.now() - 5000;
					for (const [k, v] of this._filterCallTracking.entries()) {
						if (v.timestamp < cutoff) {
							this._filterCallTracking.delete(k);
						}
					}
				}
			}

			const notificationTypeZeroETV = parseInt(node.dataset.typeZeroETV) === 1;
			const notificationTypeHighlight = parseInt(node.dataset.typeHighlight) === 1;
			const notificationTypeUnknownETV = parseInt(node.dataset.typeUnknownETV) === 1;
			const queueType = node.dataset.queue;
			const beforeDisplay = node.style.display;

			//Feed Paused
			if (node.dataset.feedPaused == "true") {
				this.#setElementVisibility(node, false);
				return false;
			}

			// Gold item filter for silver users
			if (
				this._monitorV3 &&
				!this._tierMgr.isGold() &&
				this._settings.get("notification.monitor.hideGoldNotificationsForSilverUser")
			) {
				const etvObj = node.querySelector("div.etv");
				if (
					etvObj &&
					this._tierMgr.getSilverTierETVLimit() != null &&
					parseFloat(etvObj.dataset.etvMin) > this._tierMgr.getSilverTierETVLimit()
				) {
					this.#setElementVisibility(node, false);
					return false;
				}
			}

			// Search filter - if search text is not empty, check if item matches
			if (this._searchText.trim()) {
				const title = node.querySelector(".a-truncate-full")?.innerText?.toLowerCase() || "";
				if (!title.includes(this._searchText.toLowerCase().trim())) {
					this.#setElementVisibility(node, false);
					return false;
				}
			}

			const displayStyle = this.#getTileDisplayStyle();
			let shouldBeVisible = false;

			if (this._filterType == -1) {
				shouldBeVisible = true;
			} else if (this._filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
				shouldBeVisible = notificationTypeZeroETV || notificationTypeHighlight;
			} else if (this._filterType == TYPE_HIGHLIGHT) {
				shouldBeVisible = notificationTypeHighlight;
			} else if (this._filterType == TYPE_ZEROETV) {
				shouldBeVisible = notificationTypeZeroETV;
			} else if (this._filterType == TYPE_REGULAR) {
				shouldBeVisible = !notificationTypeZeroETV && !notificationTypeHighlight;
			} else if (this._filterType == TYPE_UNKNOWN_ETV) {
				shouldBeVisible = notificationTypeUnknownETV;
			}

			this.#setElementVisibility(node, shouldBeVisible, displayStyle);

			//Queue filter
			let styleDisplay;
			// Use computed style for all browsers to ensure consistency
			const computedStyle = window.getComputedStyle(node);
			styleDisplay = computedStyle.display;

			// Debug logging for visibility changes
			const debugTabTitle = this._settings.get("general.debugTabTitle");
			const debugPlaceholders = this._settings.get("general.debugPlaceholders");
			if (debugTabTitle || debugPlaceholders) {
				const afterDisplay = node.style.display;
				if (beforeDisplay !== afterDisplay) {
					console.log("[NotificationMonitor] Item visibility changed", {
						asin: node.dataset.asin,
						beforeDisplay,
						afterDisplay,
						typeZeroETV: notificationTypeZeroETV,
						typeHighlight: notificationTypeHighlight,
						currentFilter: this._filterType,
						filterName:
							this._filterType === TYPE_HIGHLIGHT_OR_ZEROETV
								? "Zero ETV or KW match only"
								: this._filterType === TYPE_HIGHLIGHT
									? "Highlight only"
									: this._filterType === TYPE_ZEROETV
										? "Zero ETV only"
										: this._filterType === TYPE_REGULAR
											? "Regular only"
											: "All",
						styleDisplay,
					});
				}
			}

			if (styleDisplay == "flex" || styleDisplay == "block") {
				if (this._filterQueue == "-1") {
					return true;
				} else {
					const queueMatches = queueType == this._filterQueue;
					this.#setElementVisibility(node, queueMatches, this.#getTileDisplayStyle());
					return queueMatches;
				}
			} else {
				return false;
			}
		} finally {
			// Always remove from processing set
			this.#visibilityProcessingItems.delete(asin);

			// Log early exit summary periodically
			if (this._earlyExitCount && this._earlyExitCount.size > 0) {
				if (!this._lastEarlyExitSummary || Date.now() - this._lastEarlyExitSummary > 30000) {
					const totalEarlyExits = Array.from(this._earlyExitCount.values()).reduce((a, b) => a + b, 0);
					if (totalEarlyExits > 10) {
						if (this._settings.get("general.debugTabTitle")) {
							console.log(
								`[NotificationMonitor] Early exit summary: ${totalEarlyExits} total early exits across ${this._earlyExitCount.size} items`
							);
						}
						// Reset counters after summary
						this._earlyExitCount.clear();
					}
					this._lastEarlyExitSummary = Date.now();
				}
			}
		}
	}

	/**
	 * Disable gold items for silver users
	 * Will try to detect if the item is gold and if it is, it will hide the See Details button and the Gold tier only button.
	 * @param {object} notif - The DOM element of the tile
	 * @param {boolean} updateTier - If true, update the tier of the item
	 */
	#disableGoldItemsForSilverUsers(notif, updateTier = false) {
		if (!notif || this._monitorV2) {
			return;
		}

		//If the user is silver and the item is gold.
		if (!this._tierMgr.isGold() && notif.dataset.tier !== "silver") {
			const etvObj = notif.querySelector("div.etv");

			if (
				this._tierMgr.getSilverTierETVLimit() != null &&
				parseFloat(etvObj.dataset.etvMin) > this._tierMgr.getSilverTierETVLimit()
			) {
				//Remove the See Details button for item outside the tier limit.
				const vvpDetailsBtn = notif.querySelector(".vvp-details-btn");
				if (vvpDetailsBtn) {
					vvpDetailsBtn.style.display = "none";
				}
				const vhGoldTierOnly = notif.querySelector(".vh-gold-tier-only");
				if (vhGoldTierOnly) {
					vhGoldTierOnly.remove();
				}

				//Create a replacement button with no action linked it.
				const btn = document.createElement("span");
				btn.classList.add("a-button", "vh-gold-tier-only");
				btn.innerText = "Gold tier only";
				//Insert at the end of .vvp-item-tile-content
				notif.querySelector(".vvp-item-tile-content").appendChild(btn);

				// OPTIMIZATION: Only re-filter if visibility would change
				// Gold tier items should be hidden if the setting is enabled
				if (this._settings.get("notification.monitor.hideGoldNotificationsForSilverUser")) {
					if (this.#wouldVisibilityChange(notif)) {
						this.#processNotificationFiltering(notif);
					}
				}
			}
		} else if (updateTier) {
			const vvpDetailsBtn = notif.querySelector(".vvp-details-btn");
			if (vvpDetailsBtn) {
				vvpDetailsBtn.style.display = "unset";
			}
			const vhGoldTierOnly = notif.querySelector(".vh-gold-tier-only");
			if (vhGoldTierOnly) {
				vhGoldTierOnly.remove();
			}
		}
	}

	/**
	 * Mark an item as unavailable
	 * @param {string} asin - The ASIN of the item
	 */
	async markItemUnavailable(asin) {
		// Update the item data first
		this._itemsMgr.markItemUnavailable(asin);

		// Then update the DOM
		const notif = this._itemsMgr.getItemDOMElement(asin);
		this._disableItem(notif);
	}

	/**
	 * When the fetch recent items is completed, this function is called.
	 * It will unbuffer the feed if it is paused and sort the items.
	 */
	async fetchRecentItemsEnd() {
		this._fetchingRecentItems = false;

		// Notify all monitors that bulk fetch has ended
		if (this._soundCoordinator) {
			this._soundCoordinator.notifyBulkFetchEnd();
		}

		// PERFORMANCE DEBUG: Track fetch completion
		const perfDebug = this._settings.get("general.debugBulkOperations");
		if (perfDebug) {
			console.log("[BULK-PERF] Fetch complete, starting cleanup", {
				itemsProcessed: this._bulkItemCount || 0,
				timestamp: Date.now(),
			});
			this._bulkItemCount = 0; // Reset counter
		}

		// Clear the fetch timeout if it exists
		if (this._fetchTimeout) {
			clearTimeout(this._fetchTimeout);
			this._fetchTimeout = null;
		}

		// Play bulk sound if any items were found
		if (this._bulkSoundPending && this._bulkSoundTypes.size > 0) {
			if (this._settings.get("general.debugNotifications")) {
				console.log("[NotificationMonitor] Playing bulk notification sound:", {
					itemTypesFound: Array.from(this._bulkSoundTypes),
					itemCount: this._bulkSoundTypes.size,
					isMasterMonitor: this._isMasterMonitor,
					timestamp: Date.now(),
				});
			}

			// Play the sound using SoundCoordinator to prevent duplicates across monitors
			// SoundCoordinator will determine the highest priority sound to play
			// Pass isMaster flag to help with race condition prevention
			this._soundCoordinator.tryPlayBulkSound(this._bulkSoundTypes, "bulk-fetch", this._isMasterMonitor);

			// Reset bulk tracking
			this._bulkSoundPending = false;
			this._bulkSoundTypes.clear();
		} else if (this._settings.get("general.debugNotifications")) {
			console.log("[NotificationMonitor] No bulk sound to play:", {
				bulkSoundPending: this._bulkSoundPending,
				bulkSoundTypesSize: this._bulkSoundTypes.size,
				isMasterMonitor: this._isMasterMonitor,
			});
		}

		// Resume visibility count updates now that fetch is complete
		if (this._visibilityStateManager && this._visibilityStateManager.suspendCountUpdates) {
			this._visibilityStateManager.suspendCountUpdates(false);
		}

		if (this._feedPaused) {
			//Unbuffer the feed
			if (perfDebug) {
				console.log("[BULK-PERF] Unpausing feed after fetch");
				console.time("[BULK-PERF] Unpause operation");
			}
			this.#handlePauseClick();
			if (perfDebug) {
				console.timeEnd("[BULK-PERF] Unpause operation");
			}
		} else {
			//Can happen if the user click unpause while the feed is filling.
		}

		// Always emit event to update placeholders after fetching recent items
		// Use setTimeout to ensure DOM has settled before counting
		setTimeout(() => {
			// Always recount to ensure accuracy after fetch, as items may have been
			// added with isVisible=false during the fetch process
			const visibleCount = this._countVisibleItems();
			if (this._visibilityStateManager) {
				// Update the VisibilityStateManager with the accurate count
				this._visibilityStateManager.setCount(visibleCount);
				// Force emit the count changed event after resuming updates
				if (this._visibilityStateManager._hookMgr) {
					this._visibilityStateManager._hookMgr.hookExecute("visibility:count-changed", {
						count: visibleCount,
						source: "fetch-complete",
						timestamp: Date.now(),
					});
				}
			}

			const debugPlaceholders = this._settings?.get("general.debugPlaceholders");
			if (debugPlaceholders) {
				const itemTiles = this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
				const placeholderTiles = this._gridContainer.querySelectorAll(".vh-placeholder-tile");
				console.log("[fetchRecentItemsEnd] Fetch complete (after DOM settle)", {
					visibleCount,
					totalItems: this._itemsMgr.items.size,
					gridChildren: this._gridContainer.children.length,
					itemTiles: itemTiles.length,
					placeholders: placeholderTiles.length,
					visibilityStateCount: this._visibilityStateManager?.getCount(),
				});
			}

			// Emit fetch-complete event first to allow placeholder updates
			this.#emitGridEvent("grid:fetch-complete", { visibleCount });

			// Note: Sorting is now handled by GridEventManager after placeholders are updated

			// PERFORMANCE DEBUG: End total fetch time tracking
			// Only end the timer if it was started (same debug setting was enabled at start)
			if (perfDebug && this._bulkPerfTimerStarted) {
				console.timeEnd("[BULK-PERF] Last 100 Fetch Total Time");
				this._bulkPerfTimerStarted = false;
			}
		}, 100); // Small delay to ensure DOM has settled
	}

	/**
	 * Bulk remove items from the monitor
	 * @param {Set} asinsToKeep - A Set of ASINs to process
	 * @param {boolean} isKeepSet - If true, keep the items in the array and delete all other items, otherwise remove them
	 */
	#bulkRemoveItems(arrASINs, isKeepSet = false) {
		// Count visible items being removed before the operation
		let visibleRemovedCount = 0;

		// Debug logging controlled by setting
		const debugBulkOperations = this._settings.get("general.debugBulkOperations");
		if (debugBulkOperations) {
			console.log("[bulkRemoveItems] Starting with:", {
				arrASINsSize: arrASINs.size,
				isKeepSet,
				totalItems: this._itemsMgr.items.size,
				firstFewAsins: Array.from(arrASINs).slice(0, 5),
			});
		}

		// Suspend count updates during bulk operation to prevent intermediate emissions
		if (this._visibilityStateManager) {
			this._visibilityStateManager.suspendCountUpdates(true);
			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] Suspended count updates during bulk operation");
			}
		}

		this._preserveScrollPosition(() => {
			// Always use the optimized container replacement approach
			// Create a new empty container
			const newContainer = this._gridContainer.cloneNode(false); //Clone the container, but not the children items

			// Create a new items map to store the updated collection
			const newItems = new Map();
			const newImageUrls = new Set();

			// Get all current DOM elements for quick lookup
			const domElements = new Map();
			Array.from(this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)")).forEach(
				(element) => {
					const asin = element.id?.replace("vh-notification-", "");
					if (asin) {
						domElements.set(asin, element);
					}
				}
			);

			// First, collect items to keep and items to remove
			const itemsToKeep = [];
			let itemsToRemoveCount = 0;
			let debugRemovedItems = []; // Track removed items for debugging
			this._itemsMgr.items.forEach((item, asin) => {
				// If isKeepSet is true, keep items IN the set
				// If isKeepSet is false, keep items NOT in the set (remove items IN the set)
				const shouldKeep = isKeepSet ? arrASINs.has(asin) : !arrASINs.has(asin);

				if (shouldKeep) {
					// Get the DOM element for this item
					const element = domElements.get(asin);
					itemsToKeep.push({ asin, item, element });
					// Keep track of the image URL for duplicate detection
					if (item.data.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
						newImageUrls.add(item.data.img_url);
					}
				} else {
					itemsToRemoveCount++;
					// Count visible items being removed
					const element = domElements.get(asin);
					const isVisible = element && this.#isElementVisible(element);

					// Enhanced debugging for count mismatch investigation
					if (debugBulkOperations) {
						debugRemovedItems.push({
							asin,
							hasElement: !!element,
							isVisible,
							elementId: element?.id,
							unavailable: item.data.unavailable,
							displayStyle: element ? window.getComputedStyle(element).display : "no-element",
							// Check if VisibilityStateManager has different visibility state
							vsmVisible: this._visibilityStateManager
								? this._visibilityStateManager.isVisible(element)
								: null,
						});
					}

					if (isVisible) {
						visibleRemovedCount++;
					}
					// Clean up DOM references for items being removed
					if (item.element) {
						item.element = null;
					}
					if (item.tile) {
						item.tile = null;
					}
				}
			});

			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] After processing:", {
					itemsToKeepCount: itemsToKeep.length,
					itemsToRemoveCount,
					visibleRemovedCount,
					logic: `isKeepSet=${isKeepSet}, so shouldKeep = ${isKeepSet ? "arrASINs.has(asin)" : "!arrASINs.has(asin)"}`,
					expectedItemsAfter: this._itemsMgr.items.size - itemsToRemoveCount,
					// Debug info for count mismatch
					removedItemsDebug: debugRemovedItems.slice(0, 10), // Show first 10 removed items
					invisibleRemovedCount: itemsToRemoveCount - visibleRemovedCount,
					summary: {
						totalRemoved: itemsToRemoveCount,
						visibleRemoved: visibleRemovedCount,
						withoutElements: debugRemovedItems.filter((item) => !item.hasElement).length,
						invisibleWithElements: debugRemovedItems.filter((item) => item.hasElement && !item.isVisible)
							.length,
					},
				});
			}

			// First update the items map to only contain items we're keeping
			this._itemsMgr.items.clear();
			itemsToKeep.forEach(({ asin, item }) => {
				this._itemsMgr.items.set(asin, item);
			});

			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] Before sort:", {
					itemsToKeepCount: itemsToKeep.length,
					itemsMgrSize: this._itemsMgr.items.size,
					itemsToKeepSample: itemsToKeep.slice(0, 5).map(({ asin, item }) => ({
						asin,
						unavailable: item.data.unavailable,
						hasElement: !!item.element,
					})),
				});
			}

			// Now sort only the items we're keeping
			const sortedItems = this._itemsMgr.sortItems();

			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] After sort:", {
					sortedItemsCount: sortedItems.length,
					itemsMgrSize: this._itemsMgr.items.size,
					sortedItemsSample: sortedItems.slice(0, 5).map((item) => ({
						asin: item.asin,
						unavailable: item.data.unavailable,
						hasElement: !!item.element,
					})),
				});
			}

			// Add items to new container in sorted order
			sortedItems.forEach((sortedItem) => {
				// Find the corresponding kept item with DOM element
				const keptItem = itemsToKeep.find((k) => k.asin === sortedItem.asin);

				// Add to new items map
				newItems.set(sortedItem.asin, sortedItem);

				// Append DOM element if it exists
				if (keptItem && keptItem.element) {
					newContainer.appendChild(keptItem.element);
				}
			});

			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] Final state:", {
					newItemsSize: newItems.size,
					newContainerChildren: newContainer.children.length,
					expectedItems: itemsToKeep.length,
				});
			}

			// Notify MemoryDebugger that we're removing the old container's listener
			if (window.MEMORY_DEBUGGER && this.#eventHandlers.grid) {
				window.MEMORY_DEBUGGER.untrackListener(this._gridContainer, "click", this.#eventHandlers.grid);
			}

			// Replace the old container with the new one
			this._gridContainer.parentNode.replaceChild(newContainer, this._gridContainer);
			this._gridContainer = newContainer;

			// Re-add placeholders after bulk removal
			// This ensures placeholders are maintained after clearing unavailable items
			if (this._noShiftGrid) {
				this._noShiftGrid.insertPlaceholderTiles();
			}

			if (this._noShiftGrid) {
				this._noShiftGrid.updateGridContainer(this._gridContainer);
			}

			// Reattach event listeners to the new container
			this._createListeners(true); //True to limit the creation of a listener to the grid container only.

			// Update the data structures
			this._itemsMgr.items = newItems;
			this._itemsMgr.imageUrls = newImageUrls;
		});

		// Resume count updates and emit the final count
		if (this._visibilityStateManager) {
			this._visibilityStateManager.suspendCountUpdates(false);
			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] Resumed count updates after bulk operation");
			}
		}

		// Emit event if any visible items were removed
		if (visibleRemovedCount > 0) {
			this.#emitGridEvent("grid:items-removed", { count: visibleRemovedCount });
		}

		// Trigger a re-sort to ensure proper ordering and placeholder management
		this.#emitGridEvent("grid:sort-needed");
	}

	/**
	 * Auto truncate the items in the monitor according to the set limit.
	 * @param {boolean} forceRun - If true, run the truncation immediately, otherwise debounce the truncation
	 */
	#autoTruncate(forceRun = false) {
		// Clear any existing debounce timer
		if (this._autoTruncateDebounceTimer) {
			clearTimeout(this._autoTruncateDebounceTimer);
		}

		// Run immediately if forced, otherwise debounce
		const runTruncate = (fetchingRecentItems = false) => {
			// Auto truncate
			if (this._autoTruncateEnabled) {
				let visibleItemsRemovedCount = 0;
				const max = this._settings.get("notification.monitor.autoTruncateLimit");
				// Check if we need to truncate based on map size
				if (this._itemsMgr.items.size > max) {
					this._log.add(
						`NOTIF: Auto truncating item(s) from the page using the ${this._sortType} sort method.`
					);

					// Debug logging for truncation
					const debugTabTitle = this._settings.get("general.debugTabTitle");
					if (debugTabTitle) {
						console.log(`[Truncation] Starting truncation`, {
							currentSize: this._itemsMgr.items.size,
							maxLimit: max,
							toRemove: this._itemsMgr.items.size - max,
						});
					}

					// Convert map to array for sorting
					const itemsArray = Array.from(this._itemsMgr.items.entries()).map(([asin, item]) => ({
						asin,
						date: new Date(item.data.date),
						price: parseFloat(item.data.etv_min) || 0,
						element: item.element,
					}));

					// Reverse sort.
					//Truncate always clear the oldest items first, regardless of the selected sort type.
					itemsArray.sort((a, b) => a.date - b.date); // Sort oldest first (default)

					//Count how many of the items to be removed are visible
					for (let i = max; i < itemsArray.length; i++) {
						if (this.#isElementVisible(itemsArray[i].element)) {
							visibleItemsRemovedCount++;
						}
					}

					// Identify which items to keep and which to remove
					const itemsToRemoveCount = itemsArray.length - max;
					const itemsToKeep = itemsArray.slice(itemsToRemoveCount);
					const asinsToKeep = new Set(itemsToKeep.map((item) => item.asin));

					// Use bulk removal method with the optimized approach for large sets
					this.#bulkRemoveItems(asinsToKeep, true);

					// Emit truncation event with context
					this.#emitGridEvent("grid:truncated", {
						fetchingRecentItems,
						visibleItemsRemovedCount,
					});

					// Debug logging for truncation completion
					if (debugTabTitle) {
						console.log(`[Truncation] Completed truncation`, {
							visibleItemsRemoved: visibleItemsRemovedCount,
							newSize: this._itemsMgr.items.size,
							fetchingRecentItems,
						});
					}
				}
			}
		};

		if (forceRun) {
			runTruncate(false);
		} else {
			// Set a new debounce timer
			const fetchingRecentItems = this._fetchingRecentItems; //Store the feed status during the timer's delay
			this._autoTruncateDebounceTimer = setTimeout(() => {
				runTruncate(fetchingRecentItems);
			}, 100); // 100ms debounce delay
		}
	}

	/**
	 * Clear all visible items from the monitor
	 */
	#clearAllVisibleItems() {
		// Get the asin of all visible items
		const visibleItems = this._gridContainer.querySelectorAll(".vvp-item-tile:not([style*='display: none'])");
		const asins = new Set();
		visibleItems.forEach((item) => {
			const asin = item.dataset.asin;
			if (asin) {
				asins.add(asin);
			}
		});
		// Remove each visible item - bulkRemoveItems handles scroll preservation and event emission
		this.#bulkRemoveItems(asins, false);
	}

	/**
	 * Set up periodic count verification to catch off-by-one errors
	 * @private
	 */
	_setupCountVerification() {
		// Only set up if debug is enabled
		if (!this._settings.get("general.debugTabTitle")) {
			return;
		}

		// Clear any existing interval
		if (this._countVerificationInterval) {
			clearInterval(this._countVerificationInterval);
		}

		// Wait for initial load to complete
		setTimeout(() => {
			// Verify count immediately
			this._verifyCount();

			// Then set up periodic verification every 30 seconds
			this._countVerificationInterval = setInterval(() => {
				this._verifyCount();
			}, 30000);

			console.log("[NotificationMonitor] Count verification enabled - will check every 30 seconds"); // eslint-disable-line no-console
		}, 5000); // Wait 5 seconds for initial load
	}

	/**
	 * Verify that the tab title count matches the actual visible items
	 * @private
	 */
	_verifyCount() {
		if (!this._gridContainer || !this._visibilityStateManager) {
			return;
		}

		const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
		// Check actual visibility using computed style, not just the hidden class
		const actualVisibleCount = Array.from(tiles).filter((tile) => {
			const style = window.getComputedStyle(tile);
			return style.display !== "none" && !tile.classList.contains("hidden");
		}).length;
		const reportedCount = this._visibilityStateManager.getCount();

		if (actualVisibleCount !== reportedCount) {
			console.error("[NotificationMonitor] Count mismatch detected!", {
				actualVisibleCount,
				reportedCount,
				difference: actualVisibleCount - reportedCount,
				timestamp: new Date().toISOString(),
			});

			// Debug: Log sample of tiles to understand visibility
			const debugTabTitle = this._settings.get("general.debugTabTitle");
			if (debugTabTitle) {
				const sampleTiles = Array.from(tiles).slice(0, 5);
				console.log("[NotificationMonitor] Sample tile visibility:", {
					samples: sampleTiles.map((tile) => ({
						asin: tile.dataset.asin,
						hasHiddenClass: tile.classList.contains("hidden"),
						inlineDisplay: tile.style.display,
						computedDisplay: window.getComputedStyle(tile).display,
						isVisible:
							window.getComputedStyle(tile).display !== "none" && !tile.classList.contains("hidden"),
					})),
					totalTiles: tiles.length,
				});
			}

			// Auto-fix the count - this is acceptable here since:
			// 1. This only runs when debugging is enabled
			// 2. It's specifically meant to fix count mismatches
			// 3. It runs infrequently (every 30 seconds)
			this._visibilityStateManager.recalculateCount(tiles);
			console.log("[NotificationMonitor] Count recalculated to fix mismatch"); // eslint-disable-line no-console
		} else {
			console.log("[NotificationMonitor] Count verification passed:", {
				count: actualVisibleCount,
				timestamp: new Date().toISOString(),
			});
		}
	}

	/**
	 * Clear all unavailable items from the monitor
	 */
	#clearUnavailableItems() {
		// Get all unavailable ASINs
		const unavailableAsins = new Set();

		// Debug logging for clearing unavailable items
		const debugBulkOperations = this._settings.get("general.debugBulkOperations");

		// Debug: Check all items and their unavailable status
		const allItemsDebug = [];
		const unavailableVisibilityDebug = [];
		this._itemsMgr.items.forEach((item, asin) => {
			const debugInfo = {
				asin,
				unavailable: item.data.unavailable,
				unavailableType: typeof item.data.unavailable,
				isUnavailable: item.data.unavailable == 1,
			};
			allItemsDebug.push(debugInfo);

			// Check for unavailable == 1 (consistent with server data format)
			if (item.data.unavailable == 1) {
				unavailableAsins.add(asin);

				// Enhanced debugging: Check visibility state of unavailable items
				if (debugBulkOperations) {
					const element = document.getElementById(`vh-notification-${asin}`);
					const isVisible = element && this.#isElementVisible(element);
					unavailableVisibilityDebug.push({
						asin,
						hasElement: !!element,
						isVisible,
						displayStyle: element ? window.getComputedStyle(element).display : "no-element",
						// Check both visibility methods
						directCheck: element ? window.getComputedStyle(element).display !== "none" : false,
						vsmCheck:
							this._visibilityStateManager && element
								? this._visibilityStateManager.isVisible(element)
								: null,
					});
				}
			}
		});

		if (debugBulkOperations) {
			console.log("[clearUnavailableItems] === STARTING CLEAR UNAVAIL OPERATION ===");
			console.log("[clearUnavailableItems] Current visibility count:", this._visibilityStateManager?.getCount());
		}
		if (debugBulkOperations) {
			console.log("[clearUnavailableItems] Debug info:", {
				totalItems: this._itemsMgr.items.size,
				unavailableCount: unavailableAsins.size,
				unavailableAsins: Array.from(unavailableAsins).slice(0, 5), // Show first 5 for debugging
				allItemsDebug: allItemsDebug.slice(0, 20), // Show first 20 items
				sampleItems: Array.from(this._itemsMgr.items.entries())
					.slice(0, 10)
					.map(([asin, item]) => ({
						asin,
						unavailable: item.data.unavailable,
						unavailableType: typeof item.data.unavailable,
						isInSet: unavailableAsins.has(asin),
					})),
				// Visibility analysis of unavailable items
				unavailableVisibility: {
					total: unavailableVisibilityDebug.length,
					visible: unavailableVisibilityDebug.filter((item) => item.isVisible).length,
					invisible: unavailableVisibilityDebug.filter((item) => !item.isVisible).length,
					noElement: unavailableVisibilityDebug.filter((item) => !item.hasElement).length,
					samples: unavailableVisibilityDebug.slice(0, 10),
				},
			});
		}

		// Use the bulk remove method - it will handle counting and event emission
		if (debugBulkOperations) {
			console.log("[clearUnavailableItems] Calling bulkRemoveItems with", unavailableAsins.size, "items");
		}
		this.#bulkRemoveItems(unavailableAsins, false);

		// TACTICAL FIX #2: Add verification step after bulk removal
		// This is a temporary fix to handle count mismatches when some unavailable items are already hidden
		// We use the existing recalculateCount method as a safety check
		if (this._visibilityStateManager && this._visibilityStateManager.recalculateCount) {
			// Get current tiles for recalculation
			const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");

			if (debugBulkOperations) {
				console.log("[clearUnavailableItems] Running count verification after bulk removal");
			}

			// Recalculate to ensure accuracy - this will clear caches but is necessary for correctness
			this._visibilityStateManager.recalculateCount(tiles);

			if (debugBulkOperations) {
				console.log(
					"[clearUnavailableItems] Count after verification:",
					this._visibilityStateManager.getCount()
				);
			}
		} else {
			// V2 fallback - manually recount
			const newCount = this._countVisibleItems();
			this._updateTabTitle(newCount);

			if (debugBulkOperations) {
				console.log("[clearUnavailableItems] V2 count after verification:", newCount);
			}
		}

		if (debugBulkOperations) {
			console.log("[clearUnavailableItems] === CLEAR UNAVAIL OPERATION COMPLETE ===");
		}
	}

	/**
	 * Insert a tile in the DOM according to the ETV value
	 * @param {DocumentFragment} fragment - The DOM fragment to insert the tile into
	 * @param {string} asin - The ASIN of the item
	 * @param {float} etv_min - The minimum ETV value
	 */
	#insertTileAccordingToETV(fragment, asin, etv_min) {
		if (etv_min !== null) {
			// For price sorting, find the correct position and insert there
			const newPrice = parseFloat(etv_min) || 0;
			let insertPosition = null;

			// Find the first item with a lower price
			const existingItems = Array.from(this._itemsMgr.items.entries());
			for (const [existingAsin, item] of existingItems) {
				// Skip the current item or items without elements
				if (existingAsin === asin || !item.element) continue;

				const existingPrice = parseFloat(item.data.etv_min) || 0;
				if (this._sortType === TYPE_PRICE_DESC && newPrice > existingPrice) {
					insertPosition = item.element;
					break;
				} else if (this._sortType === TYPE_PRICE_ASC && newPrice < existingPrice) {
					insertPosition = item.element;
					break;
				}
			}

			if (insertPosition) {
				// Insert before the found position
				this._gridContainer.insertBefore(fragment, insertPosition);
			} else {
				// If no position found or item has highest price, append to the end
				this._gridContainer.appendChild(fragment);
			}
		} else {
			// If no ETV min, append to the end
			this._gridContainer.appendChild(fragment);
		}
	}

	/**
	 * Add a tile to the monitor
	 * @param {object} item - Item object containing the item data
	 * @returns {false|object} - Return the DOM element of the tile if added, false otherwise
	 */
	async addTileInGrid(item, reason = "") {
		if (!(item instanceof Item)) {
			throw new Error("item is not an instance of Item");
		}

		item.setUnavailable(item.data.unavailable == 1);
		item.setTitle(unescapeHTML(unescapeHTML(item.data.title)));
		item.setDate(YMDHiStoISODate(item.data.date)); //Convert server date time to local date time
		item.setDateAdded(YMDHiStoISODate(item.data.date_added)); //Convert server date time to local date time

		const {
			asin,
			queue,
			tier,
			date,
			date_added,
			title,
			img_url,
			is_parent_asin,
			is_pre_release,
			enrollment_guid,
			etv_min,
			etv_max,
			KW,
			KWsMatch,
			BlurKW,
			BlurKWsMatch,
			unavailable,
		} = item.data; //Todo: Actually use the item object
		const recommendationType = item.getRecommendationType();
		const recommendationId = item.getRecommendationString(this._env);

		// If the notification already exists, update the data and return the existing DOM element
		if (this._itemsMgr.items.has(asin)) {
			const element = this._itemsMgr.getItemDOMElement(asin);
			if (element) {
				this._log.add(`NOTIF: Item ${asin} already exists, updating RecommendationId.`);

				// Check visibility before update
				const wasVisible = this.#isElementVisible(element);

				// Update the data
				this._itemsMgr.addItemData(asin, item.data);

				// Update recommendationId in the DOM
				// it's possible that the input element was removed as part of the de-duplicate image process or the gold tier check
				element.dataset.recommendationId = recommendationId;
				const inputElement = element.querySelector(`input[data-asin='${asin}']`);
				if (inputElement) {
					inputElement.dataset.recommendationId = recommendationId;
				}

				if (!item.data.unavailable) {
					this._enableItem(element); //Return the DOM element of the tile.
				}

				// OPTIMIZATION: Only handle visibility change if it would actually change
				// This prevents redundant processing when updating existing items
				if (this.#wouldVisibilityChange(element)) {
					this.#handleVisibilityChange(element, wasVisible);
				}

				return element;
			}
		}

		// Check if the de-duplicate image setting is on
		if (this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			if (this._itemsMgr.imageUrls.has(img_url)) {
				return false; // The image already exists, do not add the item
			}
		}

		// Store the item data
		this._itemsMgr.addItemData(asin, item.data);

		// Generate the search URL
		let search_url;
		if (
			this._settings.isPremiumUser(2) &&
			this._settings.get("general.searchOpenModal") &&
			is_parent_asin != null &&
			enrollment_guid != null
		) {
			const options = item.getCoreInfo();
			search_url = `https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${encodeURIComponent(JSON.stringify(options))}`;
		} else {
			let truncatedTitle = title.length > 40 ? title.substr(0, 40).split(" ").slice(0, -1).join(" ") : title;
			truncatedTitle = removeSpecialHTML(truncatedTitle);
			//Remove single letter words
			truncatedTitle = truncatedTitle
				.split(" ")
				.filter((word) => word.length > 1)
				.join(" ");
			const search_url_slug = encodeURIComponent(truncatedTitle);
			search_url = `https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?search=${search_url_slug}`;
		}

		let prom2 = await this._tpl.loadFile("scripts/ui/templates/" + this._itemTemplateFile);
		this._tpl.setVar("id", asin);
		this._tpl.setVar("domain", this._i13nMgr.getDomainTLD());
		this._tpl.setVar("img_url", img_url);
		this._tpl.setVar("asin", asin);
		this._tpl.setVar("tier", tier);
		this._tpl.setVar("date_added", date_added);
		this._tpl.setVar("date_received", new Date());
		this._tpl.setVar("date_sent", date);
		this._tpl.setVar("date_displayed", this._formatDate(date));
		// Don't mark items as paused if we're fetching recent items
		// This ensures they can be properly counted as visible
		this._tpl.setVar("feedPaused", this._feedPaused);
		this._tpl.setVar("queue", queue);
		this._tpl.setVar("description", escapeHTML(title));
		this._tpl.setVar("reason", reason);
		this._tpl.setVar("highlightKW", KW);
		this._tpl.setVar("blurKW", BlurKW);
		this._tpl.setVar("is_parent_asin", is_parent_asin); //"true" or "false"
		this._tpl.setVar("enrollment_guid", enrollment_guid);
		this._tpl.setVar("recommendationType", recommendationType);
		this._tpl.setVar("recommendationId", recommendationId);
		this._tpl.setVar("search_url", search_url);
		this._tpl.setIf("is_parent_asin", is_parent_asin == "true" || is_parent_asin === true);
		this._tpl.setVar("is_pre_release", is_pre_release == "true" || is_pre_release === true);
		this._tpl.setIf("delayed", reason.includes("enrollement_guid") || reason.includes("queue"));
		this._tpl.setIf(
			"announce",
			this._settings.get("discord.active") && this._settings.get("discord.guid", false) != null
		);
		this._tpl.setIf("pinned", this._settings.get("pinnedTab.active"));
		this._tpl.setIf(
			"variant",
			this._settings.isPremiumUser() &&
				this._settings.get("general.displayVariantIcon") &&
				is_parent_asin === "true"
		);

		const tileDOM = await this._tpl.render(prom2, true);

		// Create fragment and add the tile to it
		const fragment = document.createDocumentFragment();
		fragment.appendChild(tileDOM);

		this._preserveScrollPosition(() => {
			// Insert the tile based on sort type
			if (this._sortType === TYPE_PRICE_DESC || this._sortType === TYPE_PRICE_ASC) {
				//The tile will need to be inserted in a specific position based on the ETV value
				this.#insertTileAccordingToETV(fragment, asin, etv_min);
			} else if (this._sortType === TYPE_DATE_ASC) {
				// For date ascending, append to the end
				this._gridContainer.appendChild(fragment);
			} else {
				//Sort DESC
				// For date descending (default), insert at the beginning but after placeholders
				let insertPosition = this._gridContainer.firstChild;
				while (insertPosition && insertPosition.classList.contains("vh-placeholder-tile")) {
					insertPosition = insertPosition.nextSibling;
				}
				if (insertPosition) {
					this._gridContainer.insertBefore(fragment, insertPosition);
				} else {
					// All children are placeholders or container is empty
					this._gridContainer.appendChild(fragment);
				}
			}
		});

		// Store a reference to the DOM element
		const wasMarkedUnavailable = this._itemsMgr.storeItemDOMElement(asin, tileDOM); //Store the DOM element
		const tile = this._itemsMgr.getItemTile(asin);

		// Track tile creation for memory debugging
		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackTile(tileDOM, asin);
		}

		// Debug logging for count tracking
		const debugTabTitle = this._settings.get("general.debugTabTitle");
		if (debugTabTitle) {
			const isVisible = tileDOM.style.display !== "none" && !tileDOM.classList.contains("hidden");
			console.log("[NotificationMonitor] New item added to DOM", {
				asin,
				isVisible,
				display: tileDOM.style.display,
				hasHiddenClass: tileDOM.classList.contains("hidden"),
				currentVisibilityStateCount: this._visibilityStateManager?.getCount(),
				timestamp: new Date().toISOString(),
			});
		}

		// If the item was marked as unavailable before its DOM was ready, apply the unavailable visual state now
		if (wasMarkedUnavailable) {
			this._disableItem(tileDOM);
		}

		if (this._monitorV3 && this._settings.isPremiumUser(2) && this._settings.get("general.displayVariantButton")) {
			if (is_parent_asin && item.data.variants) {
				for (const variant of item.data.variants) {
					await tile.addVariant(variant.asin, variant.title, variant.etv);
				}
				tile.updateVariantCount();
			}
		}

		// Check if the item is already pinned and update the pin icon
		if (this._settings.get("pinnedTab.active")) {
			const isPinned = await this._pinMgr.checkIfPinned(asin);
			if (isPinned) {
				this._pinMgr.pinItem(item);
			}
		}

		//Set the tile custom dimension according to the settings.
		if (!this._monitorV2 && !this._settings.get("notification.monitor.listView")) {
			this._tileSizer.adjustAll(tileDOM);
		}
		//Add tool tip to the truncated item title link
		if (!this._monitorV2 && this._settings.get("general.displayFullTitleTooltip")) {
			const titleDOM = tileDOM.querySelector(".a-link-normal");
			this._tooltipMgr.addTooltip(titleDOM, title);
		}

		//If the feed is paused, up the counter and rename the Resume button
		if (this._feedPaused) {
			this._feedPausedAmountStored++;
			// Update pause button immediately when processing items
			this.#updatePauseButtonCount(this._feedPausedAmountStored);

			//Sleep for 1 frame to allow the value to be updated
			if (this._feedPausedAmountStored % 20 == 0) {
				await new Promise((resolve) => requestAnimationFrame(resolve));
				//await new Promise((resolve) => setTimeout(resolve, 1));
			}
		}

		//Process the item according to the notification type (highlight > 0etv > regular)
		// Note: type flags are already set above before filtering
		// Pass skipFiltering=true since filtering was already done in line 1322
		// Pass playSoundEffect=false to prevent playing sounds here - we'll play after all processing
		if (KWsMatch) {
			this.#highlightedItemFound(tileDOM, false, true); //Don't play sound yet, skip filtering
		} else if (parseFloat(etv_min) === 0) {
			this.#zeroETVItemFound(tileDOM, false, true); //Don't play sound yet, skip filtering
		} else {
			this.#regularItemFound(tileDOM, false, true); //Don't play sound yet, skip filtering
		}

		// Now play sound based on accumulated types (highest priority wins)
		const tileVisible = this.#isElementVisible(tileDOM);
		if (tileVisible || this._fetchingRecentItems) {
			this.#playItemSound(tileDOM, tileVisible);
		}

		//Process the bluring
		if (BlurKWsMatch) {
			this._blurItemFound(tileDOM);
		}

		//If we received ETV data (ie: Fetch last 100), process them
		if (etv_min != null && etv_max != null) {
			//Set the ETV values (min and max)
			this.#setETV(tileDOM, etv_min);
			this.#setETV(tileDOM, etv_max);

			// Check for Zero ETV after both values are set
			// This prevents duplicate checks when setting min and max separately
			this.#checkZeroETVStatus(tileDOM);
		} else {
			//The ETV is not known
			const brendaAnnounce = tileDOM.querySelector("#vh-announce-link-" + asin);
			if (brendaAnnounce) {
				brendaAnnounce.style.display = "none";
			}
		}

		//If unavailable, change opacity
		if (unavailable == 1) {
			this._disableItem(tileDOM);
		}

		//Check gold tier status for this item
		this.#disableGoldItemsForSilverUsers(tileDOM);

		if (this._mostRecentItemDate == null || date > this._mostRecentItemDate) {
			if (this._mostRecentItemDateDOM) {
				this._mostRecentItemDateDOM.innerText = this._formatDate(date);
			}
			this._mostRecentItemDate = date;
		}

		// Set type flags BEFORE filtering so visibility is calculated correctly
		// Note: These are not mutually exclusive - an item can have multiple types
		if (KWsMatch) {
			tileDOM.dataset.typeHighlight = 1;
		}

		// Check ETV status independently of keyword matching
		if (parseFloat(etv_min) === 0 || parseFloat(etv_max) === 0) {
			tileDOM.dataset.typeZeroETV = 1;
		} else if (etv_min == "" || etv_min == null || etv_max == "" || etv_max == null) {
			// Mark items with unknown ETV
			tileDOM.dataset.typeUnknownETV = 1;
		}

		//Set the highlight color as needed - MUST be called AFTER setting type attributes
		this._processNotificationHighlight(tileDOM);

		//Apply the filters
		const perfDebug = this._settings.get("general.debugBulkOperations");
		if (perfDebug && this._fetchingRecentItems) {
			if (!this._bulkItemCount) this._bulkItemCount = 0;
			this._bulkItemCount++;
			if (this._bulkItemCount % 50 === 0) {
				console.log(`[BULK-PERF] Processing item ${this._bulkItemCount}`, {
					asin,
					feedPaused: this._feedPaused,
					willBeInvisible: this._feedPaused, // Items will be invisible if feed is paused
				});
			}
		}
		const isVisible = this.#processNotificationFiltering(tileDOM);

		// Emit grid events during normal operation or when fetching recent items
		// Always emit during fetch to ensure counts stay accurate
		if (!this._feedPaused || this._fetchingRecentItems) {
			// Emit event immediately to avoid visual delays
			// Don't include count - visibility is tracked by VisibilityStateManager when setElementVisibility is called
			this.#emitGridEvent("grid:items-added", {});

			// Debug: Log when new items are added
			if (this._settings.get("general.debugPlaceholders") || this._settings.get("general.debugTabTitle")) {
				console.log("[NotificationMonitor] New item added", {
					asin,
					isVisible,
					currentCount: this._visibilityStateManager?.getCount(),
					feedPaused: this._feedPaused,
					fetchingRecentItems: this._fetchingRecentItems,
					tileVisible: this.#isElementVisible(tileDOM),
					computedDisplay: window.getComputedStyle(tileDOM).display,
				});
			}
		}

		//Autotruncate the items if there are too many
		this.#autoTruncate(!this._feedPaused); //If we are paused, autotruncate will debounce itself.

		return tileDOM; //Return the DOM element for the tile.
	}

	async addVariants(data) {
		if (this._monitorV3 && this._settings.isPremiumUser(2) && this._settings.get("general.displayVariantButton")) {
			if (this._itemsMgr.items.has(data.asin)) {
				const tile = this._itemsMgr.getItemTile(data.asin);
				if (tile) {
					if (data.variants && data.variants.length > 0) {
						for (const variant of data.variants) {
							await tile.addVariant(variant.asin, variant.title, variant.etv);
						}
						tile.updateVariantCount();
					}
				}
			}
		}
	}

	/**
	 * Remove "one" item from the monitor.
	 * not used by: the auto-truncate feature
	 * used by: hide click handler, etv filtering.
	 * @param {object} tile - The DOM element of the tile
	 * @param {string} asin - The ASIN of the item
	 */
	#removeTile(tile, asin) {
		if (!tile || !asin) {
			return;
		}

		// Clean up from ETV processing tracking
		this.#etvProcessingItems.delete(asin);

		// Enhanced logging for memory debugging
		if (window.MEMORY_DEBUGGER && this._settings.get("general.debugMemory")) {
			console.log(`🗑️ Removing tile for ASIN: ${asin}`);

			// Check for event listeners on tile elements before removal
			const elementsWithListeners = [];

			// Check the tile itself
			if (tile.onclick || tile.addEventListener) {
				elementsWithListeners.push({ element: "tile", tag: tile.tagName, classes: tile.className });
			}

			// Check all buttons in the tile
			const buttons = tile.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
			buttons.forEach((btn) => {
				if (btn.onclick || btn.addEventListener) {
					elementsWithListeners.push({
						element: "button/link",
						tag: btn.tagName,
						classes: btn.className,
						text: btn.textContent?.substring(0, 30),
					});
				}
			});

			if (elementsWithListeners.length > 0) {
				console.warn(
					`⚠️ Tile ${asin} has ${elementsWithListeners.length} elements that might have listeners:`,
					elementsWithListeners
				);
			}

			// Mark the tile as removed in the debugger
			window.MEMORY_DEBUGGER.markRemoved(tile);
		}

		// Check if tile was visible before removal
		const wasVisible = this.#isElementVisible(tile);

		// Get the item data to access its image URL
		const item = this._itemsMgr.items.get(asin);
		const imgUrl = item?.data?.img_url;

		// Remove the tooltip
		const a = tile.querySelector(".a-link-normal");
		if (a) {
			this._tooltipMgr.removeTooltip(a);
		}

		// Call the tile's destroy method to clean up event listeners
		// Get the Tile instance from ItemsMgr
		const tileInstance = this._itemsMgr.tiles.get(item);
		if (tileInstance && typeof tileInstance.destroy === "function") {
			tileInstance.destroy();
		} else if (window.MEMORY_DEBUGGER && this._settings.get("general.debugMemory")) {
			console.warn(`⚠️ Tile ${asin} does not have a destroy method or could not find Tile instance!`);
		}

		// Remove from data structures
		this._itemsMgr.removeAsin(asin);

		// Also remove the image URL from the set if duplicate detection is enabled
		if (imgUrl && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this._itemsMgr.imageUrls.delete(imgUrl);
		}

		// Remove the element from DOM with scroll position preserved
		this._preserveScrollPosition(() => {
			tile.remove();
		});
		tile = null;

		// Emit event for item removal with count
		this.#emitGridEvent("grid:items-removed", { count: wasVisible ? 1 : 0 });
	}

	/**
	 * Set the ETV for an item. Call it twice with min and max values to set a range.
	 * @param {object} notif - The DOM element of the tile
	 * @param {number} etv - The ETV value
	 * @returns {boolean} - True if the ETV was set, false otherwise
	 */
	async #setETV(notif, etv) {
		if (!notif) {
			return false;
		}
		const asin = notif.dataset.asin;
		const etvObj = notif.querySelector("div.etv");
		const etvTxt = etvObj.querySelector("span.etv");
		const brendaAnnounce = notif.querySelector("#vh-announce-link-" + asin);

		// Declare wasHighlighted at function scope to avoid undefined errors
		let wasHighlighted = false;

		//Update the ETV value in the hidden fields
		// oldMaxValue kept for potential future use in determining if a new 0ETV was found
		// eslint-disable-next-line no-unused-vars
		let oldMaxValue = etvObj.dataset.etvMax;
		if (etvObj.dataset.etvMin == "" || etv < etvObj.dataset.etvMin) {
			etvObj.dataset.etvMin = etv;
		}

		if (etvObj.dataset.etvMax == "" || etv > etvObj.dataset.etvMax) {
			etvObj.dataset.etvMax = etv;
		}

		// Ensure etvMin is always less than or equal to etvMax
		if (parseFloat(etvObj.dataset.etvMin) > parseFloat(etvObj.dataset.etvMax)) {
			const temp = etvObj.dataset.etvMin;
			etvObj.dataset.etvMin = etvObj.dataset.etvMax;
			etvObj.dataset.etvMax = temp;
		}

		//Display for formatted ETV in the toolbar
		if (etvObj.dataset.etvMin != "" && etvObj.dataset.etvMax != "") {
			etvObj.style.display = this._monitorV2 ? "inline-block" : "block";
			if (etvObj.dataset.etvMin == etvObj.dataset.etvMax) {
				etvTxt.innerText = this._formatETV(etvObj.dataset.etvMin);
			} else {
				etvTxt.innerText =
					this._formatETV(etvObj.dataset.etvMin) + "-" + this._formatETV(etvObj.dataset.etvMax);
			}
		}

		//If Brenda is enabled, toggle the button display according to wether the ETV is known.
		if (brendaAnnounce) {
			if (etvObj.dataset.etvMin === "") {
				brendaAnnounce.style.display = "none";
			} else {
				brendaAnnounce.style.display = "block";
			}
		}

		// Re-evaluate keywords if any have ETV conditions
		const highlightKeywords = this._settings.get("general.highlightKeywords");
		wasHighlighted = notif.dataset.typeHighlight == 1;
		if (highlightKeywords && hasAnyEtvConditions(highlightKeywords)) {
			const title = notif.querySelector(".a-truncate-full").innerText;
			if (title) {
				// Check keyword match with new ETV values
				const matchedKeyword = await keywordMatch(
					highlightKeywords,
					title,
					etvObj.dataset.etvMin,
					etvObj.dataset.etvMax,
					this._settings
				);

				const technicalBtn = this._gridContainer.querySelector("#vh-reason-link-" + asin + ">div");

				if (matchedKeyword !== false) {
					// Item matches a keyword
					if (technicalBtn) {
						technicalBtn.dataset.highlightkw = matchedKeyword;
					}

					// Set the highlight flag
					notif.dataset.typeHighlight = 1;

					if (!wasHighlighted) {
						// New highlight detected during ETV re-evaluation
						// Get current visibility for sound check
						const currentlyVisible = this.#isElementVisible(notif);

						// Play sound based on accumulated types (highlight has priority)
						if (currentlyVisible || this._fetchingRecentItems) {
							this.#playItemSound(notif, currentlyVisible);
						}

						// Move to top if not fetching and sort allows it
						if (!this._fetchingRecentItems && this._sortType !== TYPE_DATE_ASC) {
							this._moveNotifToTop(notif);
						}
					}
				} else if (wasHighlighted) {
					// Was highlighted but no longer matches - clear highlight
					notif.dataset.typeHighlight = 0;
					if (technicalBtn) {
						delete technicalBtn.dataset.highlightkw;
					}
				}
			}
		}

		// Return whether highlight status changed
		return wasHighlighted !== (notif.dataset.typeHighlight == 1);
	}

	/**
	 * Check if an item has Zero ETV and update flags
	 * This is separated from #setETV to avoid duplicate checks when setting min/max
	 * @param {HTMLElement} notif - The notification element
	 * @returns {boolean} - True if any flags changed
	 */
	#checkZeroETVStatus(notif) {
		if (!notif) return false;

		const etvObj = notif.querySelector("div.etv");
		if (!etvObj) return false;

		let flagsChanged = false;

		// Clear unknown ETV flag FIRST since we now have an ETV value
		// This must happen before any other flag checks to ensure correct color priority
		if (notif.dataset.typeUnknownETV == 1) {
			const debugTabTitle = this._settings.get("general.debugTabTitle");
			if (debugTabTitle) {
				console.log("[NotificationMonitor] Unknown ETV removal", {
					asin: notif.dataset.asin,
					currentFilter: this._filterType,
					filterName:
						this._filterType === TYPE_UNKNOWN_ETV
							? "Unknown ETV only"
							: this._filterType === TYPE_HIGHLIGHT_OR_ZEROETV
								? "Zero ETV or KW match only"
								: this._filterType === TYPE_ZEROETV
									? "Zero ETV only"
									: this._filterType === TYPE_HIGHLIGHT
										? "KW match only"
										: this._filterType === TYPE_REGULAR
											? "Regular only"
											: "All",
					etvMin: etvObj.dataset.etvMin,
					etvMax: etvObj.dataset.etvMax,
				});
			}

			notif.dataset.typeUnknownETV = 0;
			flagsChanged = true;
			// Don't update highlight here - wait until all flags are set
		}

		//zero ETV found, highlight the item accordingly
		if (parseFloat(etvObj.dataset.etvMin) == 0) {
			// Only process if we haven't already marked this as zero ETV
			const wasAlreadyZeroETV = notif.dataset.typeZeroETV === "1";

			// Get ASIN from the notification element
			const asin = notif.dataset.asin;

			// Check if we're already processing this item to prevent duplicate processing
			const isAlreadyProcessing = this.#etvProcessingItems.has(asin);

			if (!wasAlreadyZeroETV && !isAlreadyProcessing) {
				// Mark as processing
				this.#etvProcessingItems.add(asin);

				try {
					// Check visibility BEFORE setting the flag
					const wasVisible = this.#isElementVisible(notif);

					// Set the flag before calling the handler
					notif.dataset.typeZeroETV = 1;

					// OPTIMIZATION: Only process filtering if visibility would change
					// This prevents redundant processing when setting zero ETV flag
					let isNowVisible = wasVisible;

					if (this.#wouldVisibilityChange(notif)) {
						// Process filtering to update visibility based on the new flag
						this.#processNotificationFiltering(notif);
						isNowVisible = this.#isElementVisible(notif);
					}

					// Debug logging for Zero ETV visibility changes
					const debugTabTitle = this._settings.get("general.debugTabTitle");
					if (debugTabTitle) {
						console.log("[NotificationMonitor] Zero ETV item visibility check", {
							asin: notif.dataset.asin,
							wasVisible,
							isNowVisible,
							visibilityChanged: wasVisible !== isNowVisible,
							currentFilter: this._filterType,
							filterName:
								this._filterType === TYPE_HIGHLIGHT_OR_ZEROETV
									? "Zero ETV or KW match only"
									: this._filterType === TYPE_ZEROETV
										? "Zero ETV only"
										: "Other",
							etvMin: etvObj.dataset.etvMin,
							etvMax: etvObj.dataset.etvMax,
							stackTrace: new Error().stack.split("\n").slice(2, 5).join(" -> "),
						});
					}

					// Only call the item found handler for sorting, not for sound or visibility
					// Pass skipFiltering=true to avoid duplicate processing
					// Pass playSoundEffect=false - sound will be played based on accumulated types
					this.#zeroETVItemFound(notif, false, true);

					// Play sound based on accumulated types
					const currentlyVisible = this.#isElementVisible(notif);
					if (currentlyVisible || this._fetchingRecentItems) {
						this.#playItemSound(notif, currentlyVisible);
					}

					// Visibility changes are already handled by VisibilityStateManager via processNotificationFiltering
				} finally {
					// Always remove from processing set
					this.#etvProcessingItems.delete(asin);
				}
			}
		} else {
			// Clear the zero ETV flag when item is not zero ETV
			if (notif.dataset.typeZeroETV == 1) {
				// Check visibility BEFORE clearing the flag
				const wasVisible = this.#isElementVisible(notif);

				notif.dataset.typeZeroETV = 0;

				// OPTIMIZATION: Only re-apply filtering if visibility would change
				// This prevents redundant processing when clearing zero ETV flag
				let isNowVisible = wasVisible;

				if (this.#wouldVisibilityChange(notif)) {
					// Re-apply filtering to update visibility
					this.#processNotificationFiltering(notif);
					isNowVisible = this.#isElementVisible(notif);
				}

				// Debug logging
				const debugTabTitle = this._settings.get("general.debugTabTitle");
				if (debugTabTitle) {
					console.log("[NotificationMonitor] Clearing Zero ETV flag", {
						asin: notif.dataset.asin,
						wasVisible,
						isNowVisible,
						visibilityChanged: wasVisible !== isNowVisible,
						etvMin: etvObj.dataset.etvMin,
						etvMax: etvObj.dataset.etvMax,
					});
				}

				if (wasVisible !== isNowVisible) {
					// For V3, VisibilityStateManager handles count changes
					// For V2, emit grid event
					if (!this._visibilityStateManager) {
						this.#emitGridEvent(isNowVisible ? "grid:items-added" : "grid:items-removed", { count: 1 });
					}
				}
			}
		}

		// Update the visual highlight state after all flags have been set
		// This ensures correct color priority when transitioning from unknown ETV to Zero ETV
		if (flagsChanged) {
			this._processNotificationHighlight(notif);
		}

		return flagsChanged;
	}

	/**
	 * Set the tier for an item
	 * @param {string} asin - The ASIN of the item
	 * @param {string} tier - The tier value (silver or gold)
	 * @returns {boolean} - True if the tier was set, false otherwise
	 */
	async setTierFromASIN(asin, tier) {
		if (!this._itemsMgr.items.has(asin)) {
			return false;
		}

		if (!this._itemsMgr.updateItemTier(asin, tier)) {
			return false;
		}

		// Get the corresponding DOM element
		const notif = this._itemsMgr.getItemDOMElement(asin);
		if (!notif) {
			return false;
		}

		// Check visibility before update
		const wasVisible = this.#isElementVisible(notif);

		// Update the DOM element
		notif.dataset.tier = tier;
		const vvpDetailsBtn = notif.querySelector(".vvp-details-btn");
		if (vvpDetailsBtn) {
			vvpDetailsBtn.dataset.tier = tier;
		}

		// Handle visibility change and emit events if needed
		this.#handleVisibilityChange(notif, wasVisible);

		return true;
	}

	/**
	 * Set the ETV for an item
	 * Called when an ETV update is received from the server.
	 * @param {string} asin - The ASIN of the item
	 * @param {float} etv - The ETV value
	 * @returns {boolean} - True if the ETV was set, false otherwise
	 */
	async setETVFromASIN(asin, etv) {
		// Store old ETV value to detect if reordering is needed
		const oldETV = this._itemsMgr.items.get(asin)?.data?.etv_min || null;

		// Update the data in our Map
		if (!this._itemsMgr.updateItemETV(asin, etv)) {
			return false;
		}

		// Get the corresponding DOM element
		const notif = this._itemsMgr.getItemDOMElement(asin);
		if (!notif) {
			return false;
		}

		// CRITICAL: Check visibility BEFORE updating ETV
		// This captures items that might become visible when they receive a zero ETV value
		const wasVisible = this.#isElementVisible(notif);

		// Update the DOM element
		this.#setETV(notif, etv);

		// Check Zero ETV status after update (returns true if flags changed)
		const flagsChanged = this.#checkZeroETVStatus(notif);

		// CRITICAL: Check if visibility changed due to ETV update
		// Only call handleVisibilityChange if flags changed or visibility would change
		// This prevents redundant processing
		if (flagsChanged || this.#wouldVisibilityChange(notif)) {
			this.#handleVisibilityChange(notif, wasVisible);
		}

		// Re-position the item if using price sort and the value changed significantly
		if (this._sortType === TYPE_PRICE_DESC || this._sortType === TYPE_PRICE_ASC) {
			this.#ETVChangeRepositioning(asin, oldETV);
		}
		return true;
	}

	/**
	 * Reposition the item if using price sort and the value changed significantly
	 * @param {string} asin - The ASIN of the item
	 * @param {float} oldETV - The old ETV value
	 * @returns {boolean} - True if the item was repositioned, false otherwise
	 */
	#ETVChangeRepositioning(asin, oldETV) {
		const newETV = this._itemsMgr.items.get(asin)?.data?.etv_min || 0;
		const notif = this._itemsMgr.items.get(asin)?.element;
		if (!notif) {
			return false;
		}

		// Only reposition if the ETV changed significantly enough to potentially affect order
		if (oldETV === null || Math.abs(newETV - oldETV) > ETV_REPOSITION_THRESHOLD) {
			// First, check if repositioning is actually needed by finding the current position
			const newPrice = parseFloat(newETV);
			let currentIndex = -1;
			let targetIndex = -1;
			let index = 0;

			// Get all items in order
			const orderedItems = Array.from(this._gridContainer.children);

			// Find current position and calculate target position
			for (const element of orderedItems) {
				const itemAsin = element.dataset.asin;
				if (itemAsin === asin) {
					currentIndex = index;
				} else if (itemAsin) {
					const item = this._itemsMgr.items.get(itemAsin);
					if (item && item.data) {
						const existingPrice = parseFloat(item.data.etv_min) || 0;

						// Determine if this item should come after our repositioned item
						if (targetIndex === -1) {
							if (this._sortType === TYPE_PRICE_DESC && newPrice > existingPrice) {
								targetIndex = index;
							} else if (this._sortType === TYPE_PRICE_ASC && newPrice < existingPrice) {
								targetIndex = index;
							}
						}
					}
				}
				index++;
			}

			// If no target position found, item should go to the end
			if (targetIndex === -1) {
				targetIndex = orderedItems.length - 1;
			}

			// Adjust target index if current item is before it
			if (currentIndex !== -1 && currentIndex < targetIndex) {
				targetIndex--;
			}

			// Only reposition if the item needs to move
			if (currentIndex !== targetIndex && currentIndex !== -1) {
				// Remove the element from DOM
				notif.remove();

				// Insert at the correct position
				if (targetIndex >= orderedItems.length - 1) {
					// Append to the end
					this._gridContainer.appendChild(notif);
				} else {
					// Insert before the target element
					const targetElement = orderedItems[targetIndex];
					if (targetElement && targetElement !== notif) {
						this._gridContainer.insertBefore(notif, targetElement);
					} else {
						this._gridContainer.appendChild(notif);
					}
				}
				return true;
			}
		}

		return false;
	}

	/**
	 * Common handler for item found events
	 * @param {object} notif - The DOM element of the tile
	 * @param {string} itemType - The type of item (TYPE_ZEROETV, TYPE_HIGHLIGHT, TYPE_REGULAR)
	 * @param {boolean} playSoundEffect - If true, play the sound effect
	 * @param {boolean} skipFiltering - If true, skip re-processing filtering (used when called from ETV processing)
	 * @returns {boolean} - True if the item was found, false otherwise
	 * @private
	 */
	/**
	 * Play sound for an item based on its accumulated types
	 * Priority: Highlight > Zero ETV > Regular
	 * @param {HTMLElement} notif - The notification element
	 * @param {boolean} tileVisible - Whether the tile is visible
	 * @returns {boolean} - True if sound was played
	 */
	#playItemSound(notif, tileVisible) {
		if (!notif || !notif.dataset.asin) return false;

		const asin = notif.dataset.asin;
		
		// Determine the highest priority type for this item
		let itemType;
		if (notif.dataset.typeHighlight == 1) {
			itemType = TYPE_HIGHLIGHT;
		} else if (notif.dataset.typeZeroEtv == 1) {
			itemType = TYPE_ZEROETV;
		} else {
			itemType = TYPE_REGULAR;
		}

		// Check if sound should be played based on settings
		const soundSettings = {
			[TYPE_HIGHLIGHT]: this._settings.get("notification.monitor.highlight.sound") != "0",
			[TYPE_ZEROETV]: this._settings.get("notification.monitor.zeroETV.sound") != "0",
			[TYPE_REGULAR]: this._settings.get("notification.monitor.regular.sound") != "0"
		};

		if (!soundSettings[itemType]) {
			return false;
		}

		// During bulk fetch (either local or from another monitor), defer sounds
		if (this._fetchingRecentItems || (this._soundCoordinator && this._soundCoordinator.isBulkFetchActive())) {
			this._bulkSoundPending = true;
			this._bulkSoundTypes.add(itemType);
			
			if (this._settings.get("general.debugNotifications")) {
				console.log("[NotificationMonitor] Bulk mode - deferring sound:", {
					asin: asin,
					itemType: itemType,
					typeNames: { 0: "REGULAR", 1: "ZEROETV", 2: "HIGHLIGHT" },
					bulkSoundTypes: Array.from(this._bulkSoundTypes),
					isMasterMonitor: this._isMasterMonitor,
					localBulkFetch: this._fetchingRecentItems,
					globalBulkFetch: this._soundCoordinator?.isBulkFetchActive(),
				});
			}
			return false;
		}

		// Normal operation - use SoundCoordinator
		if (this._settings.get("general.debugNotifications")) {
			console.log("[NotificationMonitor] Playing item sound:", {
				asin: asin,
				itemType: itemType,
				typeNames: { 0: "REGULAR", 1: "ZEROETV", 2: "HIGHLIGHT" },
				tileVisible: tileVisible,
				isMasterMonitor: this._isMasterMonitor,
			});
		}

		return this._soundCoordinator.tryPlaySound(asin, itemType, tileVisible);
	}

	#handleItemFound(notif, itemType, playSoundEffect = true, skipFiltering = false) {
		if (!notif) {
			return false;
		}

		// Note: Type flags (typeZeroETV, typeHighlight) should already be set
		// before this method is called to ensure proper counting

		let tileVisible;
		if (skipFiltering) {
			// Just check current visibility without re-processing
			tileVisible = this.#isElementVisible(notif);
		} else {
			// Re-process filtering to get current visibility state
			tileVisible = this.#processNotificationFiltering(notif);
		}

		// Play sound effect if conditions are met
		// Note: We don't play sound here anymore - it will be played based on accumulated types
		// This prevents duplicate sounds when items have multiple types

		// Handle moving to top or sorting
		if (!this._fetchingRecentItems) {
			if (itemType === TYPE_ZEROETV) {
				// For price-based sorting, always trigger a re-sort
				if (this._sortType === TYPE_PRICE_DESC || this._sortType === TYPE_PRICE_ASC) {
					this.#emitGridEvent("grid:sort-needed");
				} else if (this._sortType === TYPE_DATE_DESC && this._settings.get("notification.monitor.bump0ETV")) {
					// Only move to top for date descending sort if bump0ETV is enabled
					this._moveNotifToTop(notif);
				}
				// For date ascending, do nothing - maintain insertion order
			} else if (itemType === TYPE_HIGHLIGHT && this._sortType !== TYPE_DATE_ASC) {
				this._moveNotifToTop(notif);
			}
		}

		return true;
	}

	/**
	 * Handle the zero ETV item found event
	 * @param {object} notif - The DOM element of the tile
	 * @param {boolean} playSoundEffect - If true, play the zero ETV sound effect
	 * @returns {boolean} - True if the zero ETV item was found, false otherwise
	 */
	#zeroETVItemFound(notif, playSoundEffect = true, skipFiltering = false) {
		return this.#handleItemFound(notif, TYPE_ZEROETV, playSoundEffect, skipFiltering);
	}

	#highlightedItemFound(notif, playSoundEffect = true, skipFiltering = false) {
		return this.#handleItemFound(notif, TYPE_HIGHLIGHT, playSoundEffect, skipFiltering);
	}

	#regularItemFound(notif, playSoundEffect = true, skipFiltering = false) {
		return this.#handleItemFound(notif, TYPE_REGULAR, playSoundEffect, skipFiltering);
	}

	//############################################################
	//## CLICK HANDLERS (for tiles' icons)
	//############################################################

	/**
	 * Handle the hide click event
	 * @param {Event} e - The click event
	 * @param {Element} target - The target element (which can be different from e.target)
	 */
	#handleHideClick(e, target) {
		e.preventDefault();

		const asin = target.dataset.asin;
		this._log.add(`NOTIF: Hiding icon clicked for item ${asin}`);

		// Get the DOM element from our Map
		const tile = this._itemsMgr.getItemDOMElement(asin);
		if (tile) {
			this.#removeTile(tile, asin);
		}
	}

	/**
	 * Handle the Brenda click event
	 * @param {Event} e - The click event
	 * @param {Element} target - The target element (which can be different from e.target)
	 */
	#handleBrendaClick(e, target) {
		e.preventDefault();

		if (target.classList.contains("vh-disabled")) {
			return;
		}

		const asin = target.dataset.asin;
		const queue = target.dataset.queue;

		let etv = document.querySelector("#vh-notification-" + asin + " .etv").dataset.etvMax;

		this._brendaMgr.announce(asin, etv, queue, this._i13nMgr.getDomainTLD());

		//Make the announce icon gray
		target.classList.add("vh-disabled");
	}

	/**
	 * Handle the pin click event
	 * @param {Event} e - The click event
	 * @param {Element} target - The target element (which can be different from e.target)
	 */
	async #handlePinClick(e, target) {
		e.preventDefault();

		//Debounce the pin click event
		if (!this.#pinDebounceClickable) {
			return false;
		}
		this.#pinDebounceClickable = false;
		target.classList.add("vh-disabled"); //Visually disable the pin click
		this.#pinDebounceTimer = setTimeout(async () => {
			this.#pinDebounceClickable = true;
			target.classList.remove("vh-disabled");
			clearTimeout(this.#pinDebounceTimer);
		}, 1000);
		//End of debounce

		const asin = target.dataset.asin;
		const isPinned = await this._pinMgr.checkIfPinned(asin);
		const title = target.dataset.title;

		if (isPinned) {
			// Update the icon
			this._pinMgr.unpinItem(asin);

			// Display notification
			this._displayToasterNotification({
				title: `Item ${asin} unpinned.`,
				lifespan: 3,
				content: title,
			});
		} else {
			try {
				const item = new Item({
					asin: asin,
					queue: target.dataset.queue,
					title: title,
					img_url: target.dataset.thumbnail,
					is_parent_asin: target.dataset.isParentAsin,
					enrollment_guid: target.dataset.enrollmentGuid,
				});

				// Pin the item
				this._pinMgr.pinItem(item);

				this._displayToasterNotification({
					title: `Item ${asin} pinned.`,
					lifespan: 3,
					content: title,
				});
			} catch (error) {
				console.error("[NotificationMonitor] Cannot create item for pinning -", error.message, {
					source: "pin button click",
					asin: asin,
					queue: target.dataset.queue,
					enrollment_guid: target.dataset.enrollmentGuid,
					is_parent_asin: target.dataset.isParentAsin,
					raw_dataset: target.dataset,
				});

				this._displayToasterNotification({
					title: `Failed to pin item ${asin}`,
					lifespan: 3,
					content: "Missing required data",
					type: "error",
				});
			}
		}
	}

	/**
	 * Handle the details click event
	 * @param {Event} e - The click event
	 * @param {Element} target - The target element (which can be different from e.target)
	 */
	#handleDetailsClick(e, target) {
		e.preventDefault();

		const asin = target.dataset.asin;
		const dateSent = target.dataset.dateSent;
		const dateAdded = target.dataset.dateAdded;
		const dateReceived = target.dataset.dateReceived;
		const tier = target.dataset.tier;
		const reason = target.dataset.reason;
		const highlightKW = target.dataset.highlightkw;
		const blurKW = target.dataset.blurkw;
		const queue = target.dataset.queue;

		let m = this._dialogMgr.newModal("item-details-" + asin);
		m.title = "Item " + asin;
		m.content = `
			<ul style="margin-bottom: 10px;">
				<li>First seen: ${this._formatDate(new Date(dateAdded))}</li>
				<li>Broadcast sent: ${this._formatDate(new Date(dateSent))}</li>
				<li>Broadcast reason: ${reason}</li>
				<li>Data received: ${this._formatDate(new Date(dateReceived))}</li>
				<li>Queue: ${queue}</li>
				<li>Found in tier: ${tier}</li>
				<li>Highlight Keyword: ${highlightKW}</li>
				<li>Blur Keyword: ${blurKW}</li>
			</ul>
		`;
		m.show();
	}

	/**
	 * Send a report to VH's server
	 * @param {string} asin - The ASIN of the item
	 */
	async #send_report(asin) {
		let manifest = chrome.runtime.getManifest();

		const content = {
			api_version: 5,
			app_version: manifest.version,
			country: this._i13nMgr.getCountryCode(),
			action: "report_asin",
			uuid: this._settings.get("general.uuid", false),
			asin: asin,
		};
		const s = await this._cryptoKeys.signData(content);
		content.s = s;
		content.pk = await this._cryptoKeys.getExportedPublicKey();
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};

		//Send the report to VH's server
		fetch(this._env.getAPIUrl(), options).then(function () {
			alert("Report sent. Thank you.");
		});
	}

	/**
	 * Handle the report click event
	 * @param {Event} e - The click event
	 * @param {Element} target - The target element (which can be different from e.target)
	 */
	#handleReportClick(e, target) {
		e.preventDefault(); // Prevent the default click behavior
		const asin = target.dataset.asin;

		let val = prompt(
			"Are you sure you want to REPORT the user who posted ASIN#" +
				asin +
				"?\n" +
				"Only report notifications which are not Amazon products\n" +
				"Note: False reporting may get you banned.\n\n" +
				"type REPORT in the field below to send a report:"
		);
		if (val !== null && val.toLowerCase() == "report") {
			this.#send_report(asin);
		} else {
			alert("Not reported.");
		}
	}

	#eventClosestElementLocator(e, iconSelector, handler) {
		const icon = e.target.closest(iconSelector);
		if (icon) {
			e.preventDefault();
			handler(e, icon);
			return true;
		}

		// Check if clicked on a parent link containing this icon type
		const parentLink = e.target.closest("a");
		if (parentLink && parentLink.querySelector(iconSelector) && !e.target.closest(iconSelector)) {
			e.preventDefault();
			// Find the actual icon and handle it
			const containedIcon = parentLink.querySelector(iconSelector);
			if (containedIcon) {
				handler(e, containedIcon);
				return true;
			}
		}

		return false;
	}

	/**
	 * Handle hover pause end - when mouse leaves or clicks occur
	 * @private
	 */
	#handleHoverPauseEnd() {
		if (this.#pausedByMouseoverSeeDetails) {
			this.#pausedByMouseoverSeeDetails = false;
			if (this._feedPaused) {
				this.#handlePauseClick(true); // true = hover pause
			}
		}
	}

	/**
	 * Apply filtering to all grid items
	 * @private
	 */
	#applyFilteringToAllItems() {
		// For V3 with batch support, use batch operations to reduce reflows
		if (this._visibilityStateManager && this._visibilityStateManager.batchSetVisibility) {
			const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile");
			const updates = [];

			// Calculate visibility for all tiles
			for (const node of tiles) {
				const shouldBeVisible = this.#calculateNodeVisibility(node);
				updates.push({
					element: node,
					visible: shouldBeVisible,
					displayStyle: this.#getTileDisplayStyle(),
				});
			}

			// Apply all visibility changes in one batch
			this._visibilityStateManager.batchSetVisibility(updates);
		} else {
			// V2 fallback - process items individually
			const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile");
			for (const node of tiles) {
				this.#processNotificationFiltering(node);
			}
		}
	}

	/**
	 * Calculate if a node should be visible based on all filters
	 * This is a pure function that doesn't modify the DOM
	 * @param {HTMLElement} node - The node to check
	 * @returns {boolean} Whether the node should be visible
	 */
	#calculateNodeVisibility(node) {
		if (!node) return false;

		// Feed paused check
		if (node.dataset.feedPaused == "true") {
			return false;
		}

		// Gold item filter for silver users
		if (
			this._monitorV3 &&
			!this._tierMgr.isGold() &&
			this._settings.get("notification.monitor.hideGoldNotificationsForSilverUser")
		) {
			const etvObj = node.querySelector("div.etv");
			if (
				etvObj &&
				this._tierMgr.getSilverTierETVLimit() != null &&
				parseFloat(etvObj.dataset.etvMin) > this._tierMgr.getSilverTierETVLimit()
			) {
				return false;
			}
		}

		// Search filter
		if (this._searchText.trim()) {
			const title = node.querySelector(".a-truncate-full")?.innerText?.toLowerCase() || "";
			if (!title.includes(this._searchText.toLowerCase().trim())) {
				return false;
			}
		}

		// Type filter
		const notificationTypeZeroETV = parseInt(node.dataset.typeZeroETV) === 1;
		const notificationTypeHighlight = parseInt(node.dataset.typeHighlight) === 1;
		const notificationTypeUnknownETV = parseInt(node.dataset.typeUnknownETV) === 1;

		let passesTypeFilter = false;
		if (this._filterType == -1) {
			passesTypeFilter = true;
		} else if (this._filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
			passesTypeFilter = notificationTypeZeroETV || notificationTypeHighlight;
		} else if (this._filterType == TYPE_HIGHLIGHT) {
			passesTypeFilter = notificationTypeHighlight;
		} else if (this._filterType == TYPE_ZEROETV) {
			passesTypeFilter = notificationTypeZeroETV;
		} else if (this._filterType == TYPE_REGULAR) {
			passesTypeFilter = !notificationTypeZeroETV && !notificationTypeHighlight;
		} else if (this._filterType == TYPE_UNKNOWN_ETV) {
			passesTypeFilter = notificationTypeUnknownETV;
		}

		if (!passesTypeFilter) {
			return false;
		}

		// Queue filter
		if (this._filterQueue != "-1") {
			const queueType = node.dataset.queue;
			return queueType == this._filterQueue;
		}

		return true;
	}

	#mouseoverHandler(e) {
		//Handle the See Details button
		if (
			this.#eventClosestElementLocator(e, ".vh-btn-container", () => {
				e.preventDefault();
				if (!this._feedPaused) {
					this.#pausedByMouseoverSeeDetails = true;
					this.#handlePauseClick(true); // true = hover pause
				}
			})
		)
			return;

		this.#handleHoverPauseEnd();
	}

	/**
	 * Handle all click events in the monitor
	 * @param {Event} e - The click event
	 */
	#clickHandler(e) {
		//If we are using the mouseover pause feature, and the user clicks, we need to unpause the feed
		this.#handleHoverPauseEnd();

		// If a user clicks on the link wrapper around an icon, it would navigate to the
		// default href (which is usually #) which breaks several things. We'll fix this by
		// matching the parent link elements and prevent default there (bubbling events)

		// Helper function to handle icon clicks and their parent links

		// Handle search icon
		if (
			this.#eventClosestElementLocator(e, ".vh-icon-search", (event, icon) => {
				window.open(icon.closest("a").href, "_blank");
			})
		)
			return;

		// Handle report icon
		if (
			this.#eventClosestElementLocator(e, ".vh-icon-report", (event, icon) => {
				this.#handleReportClick(event, icon);
			})
		)
			return;

		// Handle announcement icon
		if (
			this.#eventClosestElementLocator(e, ".vh-icon-announcement", (event, icon) => {
				if (this._settings.get("discord.active") && this._settings.get("discord.guid", false) != null) {
					this.#handleBrendaClick(event, icon);
				}
			})
		)
			return;

		// Handle pin icon
		if (
			this.#eventClosestElementLocator(e, ".vh-icon-pin, .vh-icon-unpin", (event, icon) => {
				if (this._settings.get("pinnedTab.active")) {
					this.#handlePinClick(event, icon);
				}
			})
		)
			return;

		// Handle hide icon
		if (
			this.#eventClosestElementLocator(e, ".vh-icon-hide", (event, icon) => {
				this.#handleHideClick(event, icon);
			})
		)
			return;

		// Handle details icon
		if (
			this.#eventClosestElementLocator(e, ".vh-icon-question", (event, icon) => {
				this.#handleDetailsClick(event, icon);
			})
		)
			return;

		//Add the click listener for the See Details button
		if (this._settings.get("notification.monitor.openLinksInNewTab") == "1" || this._ctrlPress) {
			//Deactivate Vine click handling

			const btnContainer = e.target.closest(".vvp-details-btn");
			const seeDetailsBtn = e.target.closest(".a-button-primary input");
			if (seeDetailsBtn) {
				e.preventDefault();
				//Monitor V2 does not have these buttons

				//Remove the class to remove the default behavior of the button
				if (btnContainer) {
					btnContainer.classList.remove("vvp-details-btn");
				}

				try {
					const item = new Item({
						asin: seeDetailsBtn.dataset.asin,
						queue: seeDetailsBtn.dataset.queue,
						is_parent_asin: seeDetailsBtn.dataset.isParentAsin === "true",
						is_pre_release: seeDetailsBtn.dataset.isPreRelease === "true",
						enrollment_guid: seeDetailsBtn.dataset.enrollmentGuid,
					});

					// Get core info and open modal
					const options = item.getCoreInfo();
					window.open(
						`https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${encodeURIComponent(JSON.stringify(options))}`,
						"_blank"
					);
				} catch (error) {
					console.error("[NotificationMonitor] Cannot create item for modal -", error.message, {
						source: "see details button click",
						asin: seeDetailsBtn.dataset.asin,
						queue: seeDetailsBtn.dataset.queue,
						enrollment_guid: seeDetailsBtn.dataset.enrollmentGuid,
						is_parent_asin: seeDetailsBtn.dataset.isParentAsin,
						is_pre_release: seeDetailsBtn.dataset.isPreRelease,
						raw_dataset: seeDetailsBtn.dataset,
					});
				}

				//The release key will not be captured by the event listener when the new window/tab is opened.
				if (this._ctrlPress) {
					this._ctrlPress = false;
					setTimeout(() => {
						btnContainer.classList.add("vvp-details-btn");
					}, 500);
				}
			}
		}
	}

	//#######################################################
	// Event listeners and click handlers for static elements
	//#######################################################

	/**
	 * Create listeners for the grid container
	 * @param {boolean} reattachGridContainerOnly - If true, only the grid container will be reattached
	 */
	_createListeners(reattachGridContainerOnly = false) {
		// Remove old grid handler if exists (important for bulk operations)
		if (this.#eventHandlers.grid && this._gridContainer) {
			// Try to remove the old listener if the container still exists
			try {
				this._gridContainer.removeEventListener("click", this.#eventHandlers.grid);

				// Track removal for memory debugging
				if (window.MEMORY_DEBUGGER && typeof window.MEMORY_DEBUGGER.untrackListener === "function") {
					window.MEMORY_DEBUGGER.untrackListener(this._gridContainer, "click", this.#eventHandlers.grid);
				}
			} catch (e) {
				// Container might be gone, just clear the reference
			}
			this.#eventHandlers.grid = null;
		}

		// Bind the click handler to the instance and then add as event listener
		this.#eventHandlers.grid = (e) => this.#clickHandler(e);
		this._gridContainer.addEventListener("click", this.#eventHandlers.grid);

		// Track event listener for memory debugging
		if (window.MEMORY_DEBUGGER && typeof window.MEMORY_DEBUGGER.trackListener === "function") {
			window.MEMORY_DEBUGGER.trackListener(this._gridContainer, "click", this.#eventHandlers.grid);
		}

		if (this._settings.get("notification.monitor.mouseoverPause")) {
			// Only add if not already added
			if (!this.#eventHandlers.document) {
				this.#eventHandlers.document = (e) => this.#mouseoverHandler(e);
				document.addEventListener("mouseover", this.#eventHandlers.document);

				// Track event listener for memory debugging
				if (window.MEMORY_DEBUGGER) {
					window.MEMORY_DEBUGGER.trackListener(document, "mouseover", this.#eventHandlers.document);
				}
			}
		}
		if (reattachGridContainerOnly) {
			return;
		}

		//Track the control key, used to open SeeDetails in new tab
		this.#eventHandlers.window.keydown = (event) => {
			if (event.key === "Control") {
				this._ctrlPress = true;
			}
		};
		this.#eventHandlers.window.keyup = (event) => {
			if (event.key === "Control") {
				this._ctrlPress = false;
			}
		};

		window.addEventListener("keydown", this.#eventHandlers.window.keydown, true);
		window.addEventListener("keyup", this.#eventHandlers.window.keyup, true);

		// Track event listeners for memory debugging
		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(window, "keydown", this.#eventHandlers.window.keydown);
			window.MEMORY_DEBUGGER.trackListener(window, "keyup", this.#eventHandlers.window.keyup);
		}

		// Add the fix toolbar with the pause button if we scroll past the original pause button
		const scrollToTopBtn = document.getElementById("scrollToTop-fixed");
		const originalPauseBtn = document.getElementById("pauseFeed");
		const fixedPauseBtn = document.getElementById("pauseFeed-fixed");
		const originalBtnPosition = originalPauseBtn.getBoundingClientRect().top + window.scrollY;

		// Handle scroll
		this.#eventHandlers.window.scroll = () => {
			if (window.scrollY > originalBtnPosition) {
				document.getElementById("fixed-toolbar").style.display = "block";
			} else {
				document.getElementById("fixed-toolbar").style.display = "none";
			}
		};
		window.addEventListener("scroll", this.#eventHandlers.window.scroll);

		// Store button handlers
		const scrollToTopHandler = () => {
			window.scrollTo({
				top: 0,
				behavior: "smooth",
			});
		};
		scrollToTopBtn.addEventListener("click", scrollToTopHandler);
		this.#eventHandlers.buttons.set(scrollToTopBtn, { event: "click", handler: scrollToTopHandler });

		const fixedPauseHandler = () => {
			this.#handlePauseClick();
		};
		fixedPauseBtn.addEventListener("click", fixedPauseHandler);
		this.#eventHandlers.buttons.set(fixedPauseBtn, { event: "click", handler: fixedPauseHandler });

		// Track event listeners for memory debugging
		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(window, "scroll", this.#eventHandlers.window.scroll);
			window.MEMORY_DEBUGGER.trackListener(scrollToTopBtn, "click", scrollToTopHandler);
			window.MEMORY_DEBUGGER.trackListener(fixedPauseBtn, "click", fixedPauseHandler);
		}

		// Search handler
		const searchInput = document.getElementById("search-input");
		if (searchInput) {
			const searchHandler = (event) => {
				if (this._searchDebounceTimer) {
					clearTimeout(this._searchDebounceTimer);
				}
				this._searchDebounceTimer = setTimeout(() => {
					this._searchText = event.target.value;
					// Apply search filter to all items
					this.#applyFilteringToAllItems();
					// Update visible count and emit events
					this.#updateVisibleCountAfterFiltering();
				}, 750); // 300ms debounce delay
			};
			searchInput.addEventListener("input", searchHandler);
			this.#eventHandlers.buttons.set(searchInput, { event: "input", handler: searchHandler });

			if (window.MEMORY_DEBUGGER) {
				window.MEMORY_DEBUGGER.trackListener(searchInput, "input", searchHandler);
			}
		}

		//Bind clear-monitor button
		const btnClearMonitor = document.getElementById("clear-monitor");
		const clearMonitorHandler = async () => {
			//Delete all items from the grid
			if (confirm("Clear all visible items?")) {
				this._preserveScrollPosition(() => {
					this.#clearAllVisibleItems();
				});
			}
		};
		btnClearMonitor.addEventListener("click", clearMonitorHandler);
		this.#eventHandlers.buttons.set(btnClearMonitor, { event: "click", handler: clearMonitorHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(btnClearMonitor, "click", clearMonitorHandler);
		}

		//Bind clear-unavailable button
		const btnClearUnavailable = document.getElementById("clear-unavailable");
		const clearUnavailableHandler = async () => {
			if (confirm("Clear unavailable items?")) {
				this.#clearUnavailableItems();
			}
		};
		btnClearUnavailable.addEventListener("click", clearUnavailableHandler);
		this.#eventHandlers.buttons.set(btnClearUnavailable, { event: "click", handler: clearUnavailableHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(btnClearUnavailable, "click", clearUnavailableHandler);
		}

		//Bind fetch-last-100 button
		const btnLast100 = document.getElementById("fetch-last-100");
		const fetchLast100Handler = async () => {
			btnLast100.disabled = true;

			// Start 30 second countdown
			let secondsLeft = 30;
			const originalText = btnLast100.value;
			btnLast100.value = `Wait ${secondsLeft}s`;

			const countdown = setInterval(() => {
				btnLast100.value = `Wait ${secondsLeft}s`;
				secondsLeft--;

				if (secondsLeft < 0) {
					clearInterval(countdown);
					btnLast100.value = originalText;
					btnLast100.disabled = false;
				}
			}, 1000);
			//Buffer the feed
			this._fetchingRecentItems = true;
			this._bulkSoundPending = false;
			this._bulkSoundTypes.clear();
			
			// Notify all monitors that bulk fetch is starting
			if (this._soundCoordinator) {
				this._soundCoordinator.notifyBulkFetchStart();
			}

			// PERFORMANCE DEBUG: Track bulk fetch performance
			this._bulkPerfTimerStarted = false;
			if (this._settings.get("general.debugBulkOperations")) {
				this._bulkPerfTimerStarted = true;
				console.time("[BULK-PERF] Last 100 Fetch Total Time");
				console.log("[BULK-PERF] Starting bulk fetch", {
					timestamp: Date.now(),
					currentItemCount: this._itemsMgr.items.size,
					visibleCount: this._visibilityStateManager?.getCount() || 0,
				});
			}

			// Clear any existing fetch timeout
			if (this._fetchTimeout) {
				clearTimeout(this._fetchTimeout);
			}

			// Set a timeout to recover if fetch takes too long (30 seconds)
			this._fetchTimeout = setTimeout(() => {
				console.error("Fetch operation timed out after 30 seconds, cleaning up state");
				this.fetchRecentItemsEnd();
			}, 30000);

			// Suspend visibility count updates during fetch to improve performance
			if (this._visibilityStateManager && this._visibilityStateManager.suspendCountUpdates) {
				this._visibilityStateManager.suspendCountUpdates(true);
			}

			if (!this._feedPaused) {
				this.#handlePauseClick();
			}

			if (this._isMasterMonitor) {
				this._ws.processMessage({
					type: "fetchLatestItems",
					limit: this._fetchLimit,
				});
			} else {
				this._channel.postMessage({
					type: "fetchLatestItems",
					limit: this._fetchLimit,
				});
			}
		};
		btnLast100.addEventListener("click", fetchLast100Handler);
		this.#eventHandlers.buttons.set(btnLast100, { event: "click", handler: fetchLast100Handler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(btnLast100, "click", fetchLast100Handler);
		}

		//Bind fetch-last-12hrs button
		const btnLast12hrs = document.getElementById("fetch-last-12hrs");
		if (btnLast12hrs) {
			const fetchLast12hrsHandler = async () => {
				btnLast12hrs.disabled = true;

				// Start 60 second countdown
				let secondsLeft = 60;
				const originalText = btnLast12hrs.value;
				btnLast12hrs.value = `Wait ${secondsLeft}s`;

				const countdown = setInterval(() => {
					btnLast12hrs.value = `Wait ${secondsLeft}s`;
					secondsLeft--;

					if (secondsLeft < 0) {
						clearInterval(countdown);
						btnLast12hrs.value = originalText;
						btnLast12hrs.disabled = false;
					}
				}, 1000);
				//Buffer the feed
				this._fetchingRecentItems = true;
				this._bulkSoundPending = false;
				this._bulkSoundTypes.clear();
				
				// Notify all monitors that bulk fetch is starting
				if (this._soundCoordinator) {
					this._soundCoordinator.notifyBulkFetchStart();
				}

				// Clear any existing fetch timeout
				if (this._fetchTimeout) {
					clearTimeout(this._fetchTimeout);
				}

				// Set a timeout to recover if fetch takes too long (30 seconds)
				this._fetchTimeout = setTimeout(() => {
					console.error("Fetch operation timed out after 30 seconds, cleaning up state");
					this.fetchRecentItemsEnd();
				}, 30000);

				// Suspend visibility count updates during fetch to improve performance
				if (this._visibilityStateManager && this._visibilityStateManager.suspendCountUpdates) {
					this._visibilityStateManager.suspendCountUpdates(true);
				}

				if (!this._feedPaused) {
					this.#handlePauseClick();
				}

				if (this._isMasterMonitor) {
					this._ws.processMessage({
						type: "fetchLatestItems",
						limit: "12hrs",
					});
				} else {
					this._channel.postMessage({
						type: "fetchLatestItems",
						limit: "12hrs",
					});
				}
			};
			btnLast12hrs.addEventListener("click", fetchLast12hrsHandler);
			this.#eventHandlers.buttons.set(btnLast12hrs, { event: "click", handler: fetchLast12hrsHandler });

			if (window.MEMORY_DEBUGGER) {
				window.MEMORY_DEBUGGER.trackListener(btnLast12hrs, "click", fetchLast12hrsHandler);
			}
		}

		//Bind Pause Feed button
		const btnPauseFeed = document.getElementById("pauseFeed");
		const pauseFeedHandler = () => this.#handlePauseClick();
		btnPauseFeed.addEventListener("click", pauseFeedHandler);
		this.#eventHandlers.buttons.set(btnPauseFeed, { event: "click", handler: pauseFeedHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(btnPauseFeed, "click", pauseFeedHandler);
		}

		// Bind sort and filter controls
		const sortQueue = document.querySelector("select[name='sort-queue']");
		const sortQueueHandler = async () => {
			this._sortType = sortQueue.value;
			await this._settings.set("notification.monitor.sortType", this._sortType);
			// Emit event to trigger sorting instead of calling directly
			this.#emitGridEvent("grid:sort-needed");
			// Force immediate truncate when sort type changes
			this.#autoTruncate(true);
			// Emit sort event with sort type
			this.#emitGridEvent("grid:sorted", { sortType: this._sortType });
		};
		sortQueue.addEventListener("change", sortQueueHandler);
		this.#eventHandlers.buttons.set(sortQueue, { event: "change", handler: sortQueueHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(sortQueue, "change", sortQueueHandler);
		}

		const filterType = document.querySelector("select[name='filter-type']");
		const filterTypeHandler = () => {
			this._filterType = filterType.value;
			this._settings.set("notification.monitor.filterType", this._filterType);
			//Display a specific type of notifications only
			this.#applyFilteringToAllItems();
			// Update visible count and emit events
			this.#updateVisibleCountAfterFiltering();
		};
		filterType.addEventListener("change", filterTypeHandler);
		this.#eventHandlers.buttons.set(filterType, { event: "change", handler: filterTypeHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(filterType, "change", filterTypeHandler);
		}

		const filterQueue = document.querySelector("select[name='filter-queue']");
		const filterQueueHandler = () => {
			this._filterQueue = filterQueue.value;
			this._settings.set("notification.monitor.filterQueue", this._filterQueue);
			//Display a specific queue only
			this.#applyFilteringToAllItems();
			// Update visible count and emit events
			this.#updateVisibleCountAfterFiltering();
		};
		filterQueue.addEventListener("change", filterQueueHandler);
		this.#eventHandlers.buttons.set(filterQueue, { event: "change", handler: filterQueueHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(filterQueue, "change", filterQueueHandler);
		}

		const autoTruncateCheckbox = document.getElementById("auto-truncate");
		autoTruncateCheckbox.checked = this._autoTruncateEnabled;
		const autoTruncateHandler = () => {
			this._autoTruncateEnabled = autoTruncateCheckbox.checked;
			this._settings.set("notification.monitor.autoTruncate", this._autoTruncateEnabled);
			// Force immediate truncate when auto truncate is enabled
			if (this._autoTruncateEnabled) {
				this.#autoTruncate(true);
			}
		};
		autoTruncateCheckbox.addEventListener("change", autoTruncateHandler);
		this.#eventHandlers.buttons.set(autoTruncateCheckbox, { event: "change", handler: autoTruncateHandler });

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(autoTruncateCheckbox, "change", autoTruncateHandler);
		}

		const autoTruncateLimitSelect = document.getElementById("auto-truncate-limit");
		const autoTruncateLimitHandler = () => {
			this._settings.set("notification.monitor.autoTruncateLimit", parseInt(autoTruncateLimitSelect.value));
			// Force immediate truncate when limit changes
			this.#autoTruncate(true);
		};
		autoTruncateLimitSelect.addEventListener("change", autoTruncateLimitHandler);
		this.#eventHandlers.buttons.set(autoTruncateLimitSelect, {
			event: "change",
			handler: autoTruncateLimitHandler,
		});

		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackListener(autoTruncateLimitSelect, "change", autoTruncateLimitHandler);
		}
	}

	/**
	 * Update pause button count display
	 * @private
	 * @param {number} count - The count to display
	 */
	#updatePauseButtonCount(count) {
		const pauseBtn = document.getElementById("pauseFeed");
		const pauseBtnFixed = document.getElementById("pauseFeed-fixed");

		if (pauseBtn) {
			pauseBtn.value = `Resume Feed (${count})`;
		}
		if (pauseBtnFixed) {
			pauseBtnFixed.value = `Resume Feed (${count})`;
		}
	}

	//Pause feed handler
	#handlePauseClick(isHoverPause = false) {
		this._feedPaused = !this._feedPaused;
		if (this._feedPaused) {
			this._feedPausedAmountStored = 0;
			this.#updatePauseButtonCount(0);

			if (this._settings.get("notification.monitor.pauseOverlay")) {
				//Create an overlay with a red background and a 5% opacity
				const overlay = document.createElement("div");
				overlay.id = "pauseFeedOverlay";
				overlay.style.position = "fixed";
				overlay.style.top = "0";
				overlay.style.left = "0";
				overlay.style.width = "100%";
				overlay.style.height = "100%";
				overlay.style.backgroundColor = "rgba(255, 0, 0, 0.10)";
				overlay.style.pointerEvents = "none";
				document.body.appendChild(overlay);
			}
		} else {
			if (this._settings.get("notification.monitor.pauseOverlay")) {
				document.body.removeChild(document.getElementById("pauseFeedOverlay"));
			}
			document.getElementById("pauseFeed").value = "Pause & Buffer Feed";
			document.getElementById("pauseFeed-fixed").value = "Pause & Buffer Feed";

			// TACTICAL FIX #1: Batch visibility updates to avoid 200+ individual DOM operations
			// This is a temporary fix until we migrate to DOM-based counting
			const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile");

			// PERFORMANCE DEBUG: Track individual visibility updates
			const perfDebug = this._settings.get("general.debugBulkOperations");
			let visibilityUpdateCount = 0;
			if (perfDebug) {
				console.time("[BULK-PERF] Making items visible");
			}

			// Collect all tiles that need visibility updates
			const tilesToUpdate = [];
			for (const node of tiles) {
				if (node.dataset.feedPaused == "true") {
					tilesToUpdate.push(node);
					visibilityUpdateCount++;
				}
			}

			if (tilesToUpdate.length > 0) {
				// Use requestAnimationFrame to batch DOM updates
				requestAnimationFrame(() => {
					// Suspend count updates during batch operation
					if (this._visibilityStateManager && this._visibilityStateManager.suspendCountUpdates) {
						this._visibilityStateManager.suspendCountUpdates(true);
					}

					// Update all feedPaused flags first (no reflow)
					for (const node of tilesToUpdate) {
						node.dataset.feedPaused = "false";
					}

					// Then process filtering for all items in one batch
					for (const node of tilesToUpdate) {
						this.#processNotificationFiltering(node);
					}

					// Resume count updates
					if (this._visibilityStateManager && this._visibilityStateManager.suspendCountUpdates) {
						this._visibilityStateManager.suspendCountUpdates(false);
					}

					if (perfDebug) {
						console.timeEnd("[BULK-PERF] Making items visible");
						console.log("[BULK-PERF] Visibility updates completed", {
							itemsUpdated: visibilityUpdateCount,
							totalTiles: tiles.length,
						});
					}

					// Update visibility count after unpause
					// We need to recount because items added during pause might not have been counted
					// if they were filtered out (isVisible = false) during the fetch
					const newCount = this._countVisibleItems();
					if (this._visibilityStateManager) {
						// Update the VisibilityStateManager with the correct count
						this._visibilityStateManager.setCount(newCount);
					}
					this._updateTabTitle(newCount);

					// Only emit unpause event for manual unpause, not hover unpause
					if (!isHoverPause) {
						this.#emitGridEvent("grid:unpaused");
					}
				});
			} else {
				// No items to update, just update count
				const newCount = this._countVisibleItems();
				if (this._visibilityStateManager) {
					this._visibilityStateManager.setCount(newCount);
				}
				this._updateTabTitle(newCount);

				if (!isHoverPause) {
					this.#emitGridEvent("grid:unpaused");
				}
			}
		}
	}
	/**
	 * Clean up all event listeners and references
	 * This method should be called when the monitor is being destroyed
	 * to prevent memory leaks
	 */
	destroy() {
		console.log("🧹 Destroying NotificationMonitor and cleaning up event listeners..."); // eslint-disable-line no-console

		// Remove grid container listener
		if (this.#eventHandlers.grid && this._gridContainer) {
			this._gridContainer.removeEventListener("click", this.#eventHandlers.grid);

			// Track removal for memory debugging
			if (window.MEMORY_DEBUGGER && typeof window.MEMORY_DEBUGGER.untrackListener === "function") {
				window.MEMORY_DEBUGGER.untrackListener(this._gridContainer, "click", this.#eventHandlers.grid);
			}

			this.#eventHandlers.grid = null;
		}

		// Remove document listener
		if (this.#eventHandlers.document) {
			document.removeEventListener("mouseover", this.#eventHandlers.document);
			this.#eventHandlers.document = null;
		}

		// Remove window listeners
		if (this.#eventHandlers.window.keydown) {
			window.removeEventListener("keydown", this.#eventHandlers.window.keydown, true);
			this.#eventHandlers.window.keydown = null;
		}
		if (this.#eventHandlers.window.keyup) {
			window.removeEventListener("keyup", this.#eventHandlers.window.keyup, true);
			this.#eventHandlers.window.keyup = null;
		}
		if (this.#eventHandlers.window.scroll) {
			window.removeEventListener("scroll", this.#eventHandlers.window.scroll);
			this.#eventHandlers.window.scroll = null;
		}

		// Remove all button/element listeners
		for (const [element, { event, handler }] of this.#eventHandlers.buttons) {
			if (element && handler) {
				element.removeEventListener(event, handler);
			}
		}
		this.#eventHandlers.buttons.clear();

		// Clear any timers
		if (this._searchDebounceTimer) {
			clearTimeout(this._searchDebounceTimer);
			this._searchDebounceTimer = null;
		}
		if (this._autoTruncateDebounceTimer) {
			clearTimeout(this._autoTruncateDebounceTimer);
			this._autoTruncateDebounceTimer = null;
		}
		if (this.#pinDebounceTimer) {
			clearTimeout(this.#pinDebounceTimer);
			this.#pinDebounceTimer = null;
		}

		// Destroy GridEventManager if it exists
		if (this._gridEventManager && typeof this._gridEventManager.destroy === "function") {
			this._gridEventManager.destroy();
			this._gridEventManager = null;
		}

		// Destroy NoShiftGrid if it exists
		if (this._noShiftGrid && typeof this._noShiftGrid.destroy === "function") {
			this._noShiftGrid.destroy();
			this._noShiftGrid = null;
		}

		// Destroy MasterSlave to clear interval
		if (this._masterSlave && typeof this._masterSlave.destroy === "function") {
			this._masterSlave.destroy();
			this._masterSlave = null;
		}

		// Destroy ServerCom to clear intervals
		if (this._serverComMgr && typeof this._serverComMgr.destroy === "function") {
			this._serverComMgr.destroy();
			this._serverComMgr = null;
		}

		// Destroy AutoLoad to clear timers and event listeners
		if (this._autoLoad && typeof this._autoLoad.destroy === "function") {
			this._autoLoad.destroy();
			this._autoLoad = null;
		}

		// Destroy Websocket to clear timers and connections
		if (this._ws && typeof this._ws.destroyInstance === "function") {
			this._ws.destroyInstance();
			this._ws = null;
		}

		// Destroy SoundCoordinator to clear intervals and channels
		if (this._soundCoordinator && typeof this._soundCoordinator.destroy === "function") {
			this._soundCoordinator.destroy();
			this._soundCoordinator = null;
		}

		// Clear count verification interval
		if (this._countVerificationInterval) {
			clearInterval(this._countVerificationInterval);
			this._countVerificationInterval = null;
			console.log("🧹 Cleared count verification interval"); // eslint-disable-line no-console
		}

		// Clear references
		this._gridContainer = null;
		this._visibilityStateManager = null;

		console.log("✅ NotificationMonitor cleanup complete"); // eslint-disable-line no-console
	}
}

export { NotificationMonitor };
