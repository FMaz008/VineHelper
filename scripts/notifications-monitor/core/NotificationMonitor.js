/*global chrome*/

//Todo: insertTileAccordingToETV and ETVChangeRepositioning are very similar. Could we merge some logic?

// Tile import kept for future use

import { Tile } from "/scripts/ui/components/Tile.js";

import { YMDHiStoISODate } from "/scripts/core/utils/DateHelper.js";
import { keywordMatch, hasAnyEtvConditions, keywordMatcher } from "/scripts/core/utils/KeywordMatch.js";
import { ETV_REPOSITION_THRESHOLD } from "/scripts/core/utils/KeywordUtils.js";
import { escapeHTML, unescapeHTML, removeSpecialHTML } from "/scripts/core/utils/StringHelper.js";
import { MonitorCore } from "/scripts/notifications-monitor/core/MonitorCore.js";
import { Item } from "/scripts/core/models/Item.js";

// Memory debugging - will be initialized if debug mode is enabled
let MemoryDebugger = null;
let memoryDebuggerInitialized = false;

// TileCounter debugging - will be initialized if debug mode is enabled
let TileCounterDebugger = null;
let tileCounterDebuggerInitialized = false;

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

// Filter names lookup table
const FILTER_NAMES = {
	[-1]: "All",
	[TYPE_REGULAR]: "Regular only",
	[TYPE_ZEROETV]: "Zero ETV only",
	[TYPE_HIGHLIGHT]: "KW match only",
	[TYPE_UNKNOWN_ETV]: "Unknown ETV only",
	[TYPE_HIGHLIGHT_OR_ZEROETV]: "Zero ETV or KW match only",
};

const TYPE_DATE_ASC = "date_asc";
const TYPE_DATE_DESC = "date_desc";
const TYPE_PRICE_DESC = "price_desc";
const TYPE_PRICE_ASC = "price_asc";

class NotificationMonitor extends MonitorCore {
	_feedPaused = false;
	#pausedByMouseoverSeeDetails = false;
	_feedPausedAmountStored = 0;
	_fetchingRecentItems;
	_gridContainer = null;
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
	_gridEventManager = null;

	#pinDebounceTimer = null;
	#pinDebounceClickable = true;

	// Track items currently being processed for ETV to prevent duplicate processing
	#etvProcessingItems = new Set();

	// Set to track ASINs being processed to prevent concurrent additions
	#processingASINs = new Set();

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

		// Initialize memory debugger if enabled in settings
		this._initializeMemoryDebugger();

		// Initialize debug mode for TileCounter and monitor exposure
		this._initializeDebugMode();

		// Register this instance for testing if the expose script is loaded
		if (window.VineHelper && typeof window.VineHelper.registerMonitor === "function") {
			window.VineHelper.registerMonitor(this);
			console.log("[NotificationMonitor] Registered instance for testing at window.VineHelper.monitor");
		}
	}

	/**
	 * Initialize debug mode for TileCounter and monitor exposure
	 * @private
	 */
	async _initializeDebugMode() {
		// Wait for settings to load
		await this._settings.waitForLoad();

		// Set the settings manager on the keyword matcher singleton
		// This enables debug logging in KeywordMatch
		keywordMatcher.setSettingsManager(this._settings);

		// Check for debug flags from settings
		const debugTileCounter = this._settings.get("general.debugTileCounter");

		// Only check localStorage if we're actually going to use it
		// This prevents the debug banner from showing when not needed
		if (debugTileCounter) {
			// Create VineHelper namespace if it doesn't exist
			window.VineHelper = window.VineHelper || {};
			window.VineHelper.monitor = this;

			// Initialize TileCounter debugging if enabled
			if (debugTileCounter) {
				await this._initializeTileCounterDebugger();
			}
		}
	}

	/**
	 * Initialize the TileCounter debugger if enabled in settings
	 * @private
	 */
	async _initializeTileCounterDebugger() {
		try {
			// Get the TileCounter instance
			const tileCounter = this.getTileCounter();
			if (!tileCounter) {
				console.error("[NotificationMonitor] TileCounter not available for debugging");
				return;
			}

			// Dynamically import the TileCounter debugger
			const module = await import("/scripts/notifications-monitor/debug/TileCounterDebugger.js");
			TileCounterDebugger = module.TileCounterDebugger || module.default || module;

			if (!TileCounterDebugger) {
				console.error("[NotificationMonitor] TileCounterDebugger module not found");
				return;
			}

			// Create the debugger instance
			const debuggerInstance = new TileCounterDebugger(tileCounter);

			// Expose globally for convenience
			window.tileCounter = tileCounter;
			window.tileCounterDebugger = debuggerInstance;

			console.log(
				"🔍 TileCounter Debugger loaded. Use window.tileCounter and window.tileCounterDebugger to access."
			);

			// Enable performance metrics
			tileCounter.setPerformanceMetrics(true);

			tileCounterDebuggerInitialized = true;
		} catch (error) {
			console.error("Failed to initialize TileCounterDebugger:", error);
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
	 * Determine if the item should be displayed based on the filters settings. Will hide the item if it doesn't match the filters.
	 * @param {object} node - The DOM element of the tile
	 * @param {boolean} unpausing - Whether we're unpausing the feed
	 * @param {boolean} skipLogging - Skip debug logging for bulk operations
	 * @returns {boolean} - If the node should be visible.
	 */
	#processNotificationFiltering(node, unpausing = false, skipLogging = false) {
		if (!node) {
			return false;
		}

		// Skip filtering for placeholder elements
		if (node.classList.contains("vh-placeholder-tile")) {
			return false;
		}

		const notificationTypeZeroETV = parseInt(node.dataset.typeZeroETV) === 1;
		const notificationTypeHighlight = parseInt(node.dataset.typeHighlight) === 1;
		const notificationTypeUnknownETV = parseInt(node.dataset.typeUnknownETV) === 1;
		const queueType = node.dataset.queue;
		const beforeDisplay = node.dataset.display;

		//Feed Paused
		if (node.dataset.feedPaused == "true") {
			this.#setTileDisplay(node, "none");
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
				this.#setTileDisplay(node, "none");
				return false;
			}
		}

		// Search filter - if search text is not empty, check if item matches
		if (this._searchText.trim()) {
			const title = node.querySelector(".a-truncate-full")?.innerText?.toLowerCase() || "";
			if (!title.includes(this._searchText.toLowerCase().trim())) {
				this.#setTileDisplay(node, "none");
				return false;
			}
		}

		// Simplified filter logic using a lookup table
		const filterVisibility = {
			[-1]: () => true, // Show all
			[TYPE_HIGHLIGHT_OR_ZEROETV]: () => notificationTypeZeroETV || notificationTypeHighlight,
			[TYPE_HIGHLIGHT]: () => notificationTypeHighlight,
			[TYPE_ZEROETV]: () => notificationTypeZeroETV,
			[TYPE_REGULAR]: () => !notificationTypeZeroETV && !notificationTypeHighlight,
			[TYPE_UNKNOWN_ETV]: () => notificationTypeUnknownETV,
		};

		const shouldBeVisible = filterVisibility[this._filterType]?.() || false;

		// Debug logging for keyword matching and filter visibility
		if (this._settings.get("general.debugKeywords")) {
			const asin = node.dataset.asin;
			const typeHighlight = parseInt(node.dataset.typeHighlight) || 0;
			const typeZeroETV = parseInt(node.dataset.typeZeroETV) || 0;

			// Log filter check details
			console.log("[NotificationMonitor] Filter check:", {
				asin,
				typeHighlight,
				typeZeroETV,
				currentFilter: this._filterType,
				filterName: FILTER_NAMES[this._filterType] || "Unknown",
				notificationTypeHighlight,
				notificationTypeZeroETV,
				willBeVisible: shouldBeVisible,
				timestamp: new Date().toISOString(),
			});

			// Check for visibility mismatch - items with typeHighlight=1 should be visible when filter=2 (KW Match Only)
			if (this._filterType === TYPE_HIGHLIGHT && typeHighlight === 1 && !shouldBeVisible) {
				console.warn("[NotificationMonitor] Visibility mismatch detected:", {
					asin,
					issue: "Item has typeHighlight=1 but willBeVisible=false with KW Match Only filter",
					typeHighlight,
					notificationTypeHighlight,
					filterType: this._filterType,
					timestamp: new Date().toISOString(),
				});
			}
		}

		if (!unpausing) {
			this.#setTileDisplay(node, shouldBeVisible ? this.#getTileDisplayStyle() : "none");
		}

		// Debug logging for visibility changes - skip for bulk operations
		if (!skipLogging) {
			const debugTabTitle = this._settings.get("general.debugTabTitle");
			const debugPlaceholders = this._settings.get("general.debugPlaceholders");
			if (debugTabTitle || debugPlaceholders) {
				const afterDisplay = node.dataset.display;
				if (beforeDisplay !== afterDisplay) {
					console.log("[NotificationMonitor] Item visibility changed", {
						asin: node.dataset.asin,
						beforeDisplay,
						afterDisplay,
						typeZeroETV: notificationTypeZeroETV,
						typeHighlight: notificationTypeHighlight,
						currentFilter: this._filterType,
						filterName: FILTER_NAMES[this._filterType] || "Unknown",
						styleDisplay: this.#getTileDisplayStyle(),
					});

					// Trigger a recount when visibility changes
					// Use a small delay to batch multiple changes
					if (this._tileCounter) {
						this._tileCounter.recountVisibleTiles(100, false, {
							source: "visibility-change",
							asin: node.dataset.asin,
						});
					}
				}
			}
		}

		// Queue filter - combine with type filter using AND logic
		if (this._filterQueue == "-1") {
			// No queue filter active, use type filter result
			return shouldBeVisible;
		} else {
			// Queue filter is active
			const queueMatches = queueType == this._filterQueue;

			// Item is visible only if it passes BOTH filters (when both are active)
			const finalVisibility = shouldBeVisible && queueMatches;

			if (!unpausing) {
				this.#setTileDisplay(node, finalVisibility ? this.#getTileDisplayStyle() : "none");
			}
			return finalVisibility;
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

				// Re-filter this item to apply gold tier filtering, ensuring it's hidden if the setting is enabled
				if (this._settings.get("notification.monitor.hideGoldNotificationsForSilverUser")) {
					this.#processNotificationFiltering(notif);
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
		if (this._settings.get("general.debugSound")) {
			console.log("[SOUND DEBUG] Bulk fetch ended, setting _fetchingRecentItems = false");
		}
		this._fetchingRecentItems = false;

		if (this._feedPaused) {
			//Unbuffer the feed
			this.#handlePauseClick();
		} else {
			//Can happen if the user click unpause while the feed is filling.
		}

		// Always recount to ensure accuracy after fetch, as items may have been
		// added with isVisible=false during the fetch process
		this._tileCounter.recountVisibleTiles(0, true, { source: "fetch-complete" });

		// Fetch complete - recount and emit event
		const debugPlaceholders = this._settings?.get("general.debugPlaceholders");
		if (debugPlaceholders) {
			const itemTiles = this._gridContainer.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
			const placeholderTiles = this._gridContainer.querySelectorAll(".vh-placeholder-tile");
			console.log("[fetchRecentItemsEnd] Fetch complete (after DOM settle)", {
				visibleCount: this._tileCounter.getCount(),
				totalItems: this._itemsMgr.items.size,
				gridChildren: this._gridContainer.children.length,
				itemTiles: itemTiles.length,
				placeholders: placeholderTiles.length,
				visibilityStateCount: this._tileCounter.getCount(),
			});
		}

		//Sort the grid after the fetch is complete
		this.#sortItems();
	}

	/**
	 * Remove "one" item from the monitor.
	 * not used by: the auto-truncate feature
	 * used by: hide click handler, etv filtering.
	 *
	 * This method ensures proper cleanup order to prevent memory leaks
	 * @param {string} asin - The ASIN of the tile
	 * @private
	 */
	#removeTile(asin, skipDOMremoval = false) {
		this.#etvProcessingItems.delete(asin);

		const element = this._itemsMgr.getItemDOMElement(asin);
		if (!element) {
			console.error("Item " + asin + " can't be located to remove it.");
			return false;
		}

		// Clean up any tooltips
		const linkElement = element.querySelector(".a-link-normal");
		if (linkElement) {
			this._tooltipMgr.removeTooltip(linkElement);
		}

		// CRITICAL FIX: Clean up dataset properties that might hold references
		if (element.dataset) {
			delete element.dataset.vhOriginalTitle;
			delete element.dataset.vhTileInstance;
		}

		// Clear any direct references on the element
		element.vhTileInstance = null;

		// Notify memory debugger BEFORE removing from DOM
		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.markRemoved(element);
		}

		// Remove from ItemsMgr (this will now properly clean up WeakMaps)
		this._itemsMgr.removeAsin(asin);

		// CRITICAL FIX: Clean up shared MutationObserver references
		// Import Tile class and call cleanup if available
		if (typeof Tile !== "undefined" && Tile.checkAndCleanupSharedObserver) {
			Tile.checkAndCleanupSharedObserver();
		}

		// Remove the element from the DOM AFTER cleanup
		if (!skipDOMremoval) {
			this._preserveScrollPosition(() => {
				element.remove();
			});
		}

		// Recount the visible tiles
		this._tileCounter.alterCount(-1);
	}

	/**
	 * Bulk remove items from the monitor
	 * @param {Set} asinsToKeep - A Set of ASINs to process
	 * @param {boolean} isKeepSet - If true, keep the items in the array and delete all other items, otherwise remove them
	 */
	#bulkRemoveItems(arrASINs, isKeepSet = false) {
		// Count visible items being removed before the operation
		let visibleRemovedCount = 0;

		// Bulk remove operation starting
		const debugBulkOperations = this._settings.get("general.debugBulkOperations");
		if (debugBulkOperations) {
			console.log("[bulkRemoveItems] Starting with:", {
				arrASINsSize: arrASINs.size,
				isKeepSet,
				totalItems: this._itemsMgr.items.size,
				firstFewAsins: Array.from(arrASINs).slice(0, 5),
			});
		}

		this._preserveScrollPosition(() => {
			// First, collect items to keep and items to remove
			const itemsToKeep = [];
			const itemsToRemove = [];
			let itemsToRemoveCount = 0;

			// DEBUG: Track bulk operation start
			if (debugBulkOperations) {
				console.log("[DEBUG-BULK] Starting bulk remove operation", {
					totalItems: this._itemsMgr.items.size,
					itemsToRemove: isKeepSet ? this._itemsMgr.items.size - arrASINs.size : arrASINs.size,
					isKeepSet,
					timestamp: new Date().toISOString(),
				});
			}

			this._itemsMgr.items.forEach((item, asin) => {
				// If isKeepSet is true, keep items IN the set
				// If isKeepSet is false, keep items NOT in the set (remove items IN the set)
				const shouldKeep = isKeepSet ? arrASINs.has(asin) : !arrASINs.has(asin);

				if (shouldKeep) {
					itemsToKeep.push({ asin, item });
				} else {
					itemsToRemoveCount++;
					itemsToRemove.push({ asin, item });

					// Count visible items being removed
					const element = this._itemsMgr.getItemDOMElement(asin);
					if (element && this.#isElementVisible(element)) {
						visibleRemovedCount++;
					}
				}
			});

			// CRITICAL: Clean up items that are being removed BEFORE any DOM manipulation
			itemsToRemove.forEach(({ asin }) => {
				// Remove from ItemsMgr
				this.#removeTile(asin, true);
			});

			// Update items map with kept items only
			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] After cleanup:", {
					itemsToKeepCount: itemsToKeep.length,
					itemsToRemoveCount,
					visibleRemovedCount,
					logic: `isKeepSet=${isKeepSet}, so shouldKeep = ${isKeepSet ? "arrASINs.has(asin)" : "!arrASINs.has(asin)"}`,
					expectedItemsAfter: itemsToKeep.length,
				});
			}

			// Rebuild the items map with only kept items
			this._itemsMgr.items.clear();
			const newImageUrls = new Set();
			itemsToKeep.forEach(({ asin, item }) => {
				if (!item) {
					console.log("[bulkRemoveItems] Item is null", asin);
					return;
				}
				this._itemsMgr.items.set(asin, item);
				// Keep track of the image URL for duplicate detection
				if (item.data.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
					newImageUrls.add(item.data.img_url);
				}
			});
			this._itemsMgr.imageUrls = newImageUrls;

			// Sort the kept items
			const sortedItems = this._itemsMgr.sortItems();

			// Create a new container and add sorted items
			const newContainer = this._gridContainer.cloneNode(false);
			sortedItems.forEach((sortedItem) => {
				// Find the corresponding kept item with DOM element
				const keptItem = itemsToKeep.find((k) => k.asin === sortedItem.asin);
				// Append DOM element if it exists
				const element = this._itemsMgr.getItemDOMElement(keptItem.asin);
				if (element) {
					newContainer.appendChild(element);
				}
			});

			// Replace container and update references
			if (debugBulkOperations) {
				console.log("[bulkRemoveItems] Final state:", {
					newItemsSize: this._itemsMgr.items.size,
					newContainerChildren: newContainer.children.length,
					expectedItems: itemsToKeep.length,
				});
			}

			// Notify MemoryDebugger that we're removing the old container's listener
			if (window.MEMORY_DEBUGGER && this.#eventHandlers.grid) {
				window.MEMORY_DEBUGGER.untrackListener(this._gridContainer, "click", this.#eventHandlers.grid);
			}

			// Clear the old container (should now only contain placeholders since items were already removed)
			this._clearGridContainer();

			// Replace the old container with the new one
			this._gridContainer.parentNode.replaceChild(newContainer, this._gridContainer);
			this._gridContainer = newContainer;

			// Update NoShiftGrid with the new container BEFORE inserting placeholders
			if (this._noShiftGrid) {
				this._noShiftGrid.updateGridContainer(this._gridContainer);
				// Re-add placeholders after bulk removal
				// This ensures placeholders are maintained after clearing unavailable items
				this._noShiftGrid.insertPlaceholderTiles();
			}

			// Reattach event listeners to the new container
			this._createListeners(true);
		});

		// Emit event if any visible items were removed
		if (visibleRemovedCount > 0) {
			this._tileCounter.recountVisibleTiles(0, false, { isBulkOperation: true, source: "bulk-remove" });

			// Emit grid event for removed items
			// DEBUG: Log atomic bulk operation
			if (debugBulkOperations) {
				console.log("[DEBUG-BULK] Atomic count update for bulk remove", {
					visibleRemovedCount,
					timestamp: new Date().toISOString(),
				});
			}

			if (this._noShiftGrid) {
				this._noShiftGrid.insertPlaceholderTiles();
			}
		}

		// Trigger a re-sort to ensure proper ordering and placeholder management
		this.#sortItems();
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

					// Start truncation process
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
						const element = this._itemsMgr.getItemDOMElement(itemsArray[i].asin);
						if (this.#isElementVisible(element)) {
							visibleItemsRemovedCount++;
						}
					}

					// Identify which items to keep and which to remove
					const itemsToRemoveCount = itemsArray.length - max;
					const itemsToKeep = itemsArray.slice(itemsToRemoveCount);
					const asinsToKeep = new Set(itemsToKeep.map((item) => item.asin));

					// Use bulk removal method with the optimized approach for large sets
					this.#bulkRemoveItems(asinsToKeep, true);

					if (this._noShiftGrid) {
						this._noShiftGrid.resetEndPlaceholdersCount();
						if (visibleItemsRemovedCount > 0 && !fetchingRecentItems) {
							this._noShiftGrid.insertEndPlaceholderTiles(visibleItemsRemovedCount);
						}
						this._noShiftGrid.insertPlaceholderTiles();
					}

					// Truncation completed
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

	#isElementVisible(element) {
		const computerStyle = window.getComputedStyle(element);
		return computerStyle.display !== "none";
	}

	/**
	 * Clear all unavailable items from the monitor
	 */
	#clearUnavailableItems() {
		// Get all unavailable ASINs
		const unavailableAsins = new Set();

		// Collect unavailable ASINs
		this._itemsMgr.items.forEach((item, asin) => {
			// Check for unavailable == 1 (consistent with server data format)
			if (item.data.unavailable == 1) {
				unavailableAsins.add(asin);
			}
		});

		// Clear unavailable items
		const debugBulkOperations = this._settings.get("general.debugBulkOperations");
		if (debugBulkOperations) {
			console.log("[clearUnavailableItems] Debug info:", {
				totalItems: this._itemsMgr.items.size,
				unavailableCount: unavailableAsins.size,
				unavailableAsins: Array.from(unavailableAsins).slice(0, 5), // Show first 5 for debugging
			});
		}

		// Use the bulk remove method - it will handle counting and event emission
		this.#bulkRemoveItems(unavailableAsins, false);
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

		const asin = item.data.asin;

		// Check if this ASIN is currently being processed
		if (this.#processingASINs.has(asin)) {
			// ASIN already being processed
			return false;
		}

		// Mark this ASIN as being processed
		this.#processingASINs.add(asin);

		try {
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

					// DEBUG: Log duplicate detection
					if (this._settings.get("general.debugDuplicates")) {
						const existingItem = this._itemsMgr.items.get(asin);
						console.log("[DEBUG-DUPLICATE] Item already exists", {
							asin,
							hasElement: !!element,
							imgUrl: item.data.img_url,
							existingImgUrl: existingItem?.data?.img_url,
							new_enrollment_guid: item.data.enrollment_guid,
							existing_enrollment_guid: existingItem?.data?.enrollment_guid,
							enrollment_guid_changed: existingItem?.data?.enrollment_guid !== item.data.enrollment_guid,
							reason: reason,
							timestamp: new Date().toISOString(),
							stack: new Error().stack.split("\n").slice(2, 5).join("\n"),
						});

						// Log enrollment_guid changes specifically
						if (existingItem?.data?.enrollment_guid !== item.data.enrollment_guid) {
							console.warn("[NotificationMonitor] ENROLLMENT_GUID UPDATE:", {
								asin,
								old_enrollment_guid: existingItem?.data?.enrollment_guid,
								new_enrollment_guid: item.data.enrollment_guid,
								reason: reason,
							});
						}
					}
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

					return element;
				}
			}

			// Enhanced duplicate detection - check both ASIN and image URL
			// Check if the de-duplicate image setting is on
			if (this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
				// First check if we already have this ASIN with a different image
				if (this._itemsMgr.items.has(asin)) {
					const existingItem = this._itemsMgr.items.get(asin);
					if (existingItem && existingItem.data && existingItem.data.img_url !== img_url) {
						if (this._settings.get("general.debugDuplicates")) {
							console.log("[DEBUG-DUPLICATE] ASIN exists with different image URL", {
								asin,
								newImgUrl: img_url,
								existingImgUrl: existingItem.data.img_url,
								timestamp: new Date().toISOString(),
							});
						}
						// Update the image URL if it's different
						existingItem.data.img_url = img_url;
					}
					return false; // ASIN already exists, prevent duplicate
				}

				// Then check if the image URL already exists (original logic)
				if (this._itemsMgr.imageUrls.has(img_url)) {
					// DEBUG: Log image duplicate prevention
					if (this._settings.get("general.debugDuplicates")) {
						console.log("[DEBUG-DUPLICATE] Preventing duplicate by image URL", {
							asin,
							imgUrl: img_url,
							existingImageUrls: Array.from(this._itemsMgr.imageUrls).slice(0, 5),
							timestamp: new Date().toISOString(),
						});
					}
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

			// Debug logging for keyword setting
			if (this._settings.get("general.debugKeywords")) {
				console.log(`[NotificationMonitor] Setting highlightKW for ASIN ${asin}: "${KW}"`);
			}

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
			if (this._settings.get("general.debugItemProcessing") || this._settings.get("general.debugTabTitle")) {
				const isVisible = tileDOM.dataset.display !== "none" && !tileDOM.classList.contains("hidden");
				console.log("[NotificationMonitor] New item added to DOM", {
					asin,
					isVisible,
					display: tileDOM.dataset.display,
					hasHiddenClass: tileDOM.classList.contains("hidden"),
					currentVisibilityStateCount: this._tileCounter.getCount(),
					itemDataIsVisible: item.isVisible,
					timestamp: new Date().toISOString(),
				});
			}

			// If the item was marked as unavailable before its DOM was ready, apply the unavailable visual state now
			if (wasMarkedUnavailable) {
				this._disableItem(tileDOM);
			}

			if (
				this._monitorV3 &&
				this._settings.isPremiumUser(2) &&
				this._settings.get("general.displayVariantButton")
			) {
				if (is_parent_asin && item.data.variants) {
					// Only process variants if they haven't been added yet
					if (tile.getVariants().length === 0) {
						// Process all variants in parallel for better performance
						await Promise.all(
							item.data.variants.map((variant) =>
								tile.addVariant(variant.asin, variant.title, variant.etv)
							)
						);
						tile.updateVariantCount();
					}
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
				document.getElementById("pauseFeed").value = `Resume Feed (${this._feedPausedAmountStored})`;
				document.getElementById("pauseFeed-fixed").value = `Resume Feed (${this._feedPausedAmountStored})`;

				//Sleep for 1 frame to allow the value to be updated
				if (this._feedPausedAmountStored % 20 == 0) {
					await new Promise((resolve) => requestAnimationFrame(resolve));
					//await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}

			//Process the item according to the notification type (highlight > 0etv > regular)
			//This is what determine & trigger what sound effect to play
			// Handle item-specific logic (sound, moving to top, etc.)
			// Note: type flags are already set above before filtering

			// Debug logging for sound triggering during addTileInGrid
			if (this._settings.get("general.debugSound")) {
				console.log("[SOUND DEBUG] Item sound selection in addTileInGrid:", {
					asin,
					KWsMatch,
					etv_min: parseFloat(etv_min),
					isZeroETV: parseFloat(etv_min) === 0,
					_fetchingRecentItems: this._fetchingRecentItems,
					currentFilter: this._filterType,
					filterName:
						this._filterType === TYPE_HIGHLIGHT
							? "KW match only"
							: this._filterType === TYPE_HIGHLIGHT_OR_ZEROETV
								? "Zero ETV or KW match only"
								: this._filterType === TYPE_ZEROETV
									? "Zero ETV only"
									: "Other",
					soundType: KWsMatch ? "HIGHLIGHT" : parseFloat(etv_min) === 0 ? "ZERO_ETV" : "REGULAR",
				});
			}

			// CRITICAL FIX: Set type flags BEFORE filtering so the filter knows what type of item this is
			// This must happen before processNotificationFiltering to ensure proper visibility calculation
			if (KWsMatch) {
				tileDOM.dataset.typeHighlight = 1;

				// Debug logging for typeHighlight being set
				if (this._settings.get("general.debugKeywords")) {
					console.log("[NotificationMonitor] Setting typeHighlight=1 for keyword match:", {
						asin,
						title,
						keyword: KW,
						typeHighlight: 1,
						currentFilter: this._filterType,
						filterName: FILTER_NAMES[this._filterType] || "Unknown",
						timestamp: new Date().toISOString(),
					});
				}
			}

			// Check ETV status independently of keyword matching
			if (parseFloat(etv_min) === 0 || parseFloat(etv_max) === 0) {
				tileDOM.dataset.typeZeroETV = 1;
			} else if (etv_min == "" || etv_min == null || etv_max == "" || etv_max == null) {
				// Mark items with unknown ETV
				tileDOM.dataset.typeUnknownETV = 1;
			}

			// Debug logging for ETV type flags and styling
			if (this._settings.get("general.debugItemProcessing")) {
				console.log("[DEBUG-ETV-STYLING] Item type flags set:", {
					asin,
					etv_min,
					etv_max,
					hasEtvData: etv_min != null && etv_min !== "" && etv_max != null && etv_max !== "",
					typeHighlight: tileDOM.dataset.typeHighlight || "0",
					typeZeroETV: tileDOM.dataset.typeZeroETV || "0",
					typeUnknownETV: tileDOM.dataset.typeUnknownETV || "0",
					KWsMatch,
					// Settings that affect styling
					highlightColorActive: this._settings.get("notification.monitor.highlight.colorActive"),
					zeroETVColorActive: this._settings.get("notification.monitor.zeroETV.colorActive"),
					unknownETVColorActive: this._settings.get("notification.monitor.unknownETV.colorActive"),
					ignoreUnknownETVhighlight: this._settings.get(
						"notification.monitor.highlight.ignoreUnknownETVhighlight"
					),
					timestamp: new Date().toISOString(),
				});
			}

			// BUG FIX 2: Move sound playing AFTER filtering to respect filter settings
			// First apply filtering to determine visibility
			const isVisible = this.#processNotificationFiltering(tileDOM);
			this.#setTileDisplay(tileDOM, isVisible ? this.#getTileDisplayStyle() : "none");

			// Debug logging for the complete flow sequence
			if (this._settings.get("general.debugKeywords") && KWsMatch) {
				console.log("[NotificationMonitor] Complete keyword match flow:", {
					step: "Final visibility decision",
					asin,
					title,
					keyword: KW,
					typeHighlight: tileDOM.dataset.typeHighlight,
					currentFilter: this._filterType,
					filterName: FILTER_NAMES[this._filterType] || "Unknown",
					isVisible,
					displayStyle: isVisible ? this.#getTileDisplayStyle() : "none",
					note: "This item matched a keyword and its visibility has been determined",
					timestamp: new Date().toISOString(),
				});
			}

			// BUG FIX 1: During bulk fetch, only play sounds for items that will be visible
			// This prevents sounds from playing for items that are filtered out
			const shouldPlaySound = isVisible && !this._feedPaused;
			// Play appropriate sound for item type

			// Now play sounds only for visible items
			if (KWsMatch) {
				this.#highlightedItemFound(tileDOM, shouldPlaySound); //Play the highlight sound only if visible
			} else if (parseFloat(etv_min) === 0) {
				this.#zeroETVItemFound(tileDOM, shouldPlaySound); //Play the zeroETV sound only if visible
			} else {
				this.#regularItemFound(tileDOM, shouldPlaySound); //Play the regular sound only if visible
			}

			//Process the bluring
			if (BlurKWsMatch) {
				this._blurItemFound(tileDOM);
			}

			//If we received ETV data (ie: Fetch last 100), process them
			if (etv_min != null && etv_max != null) {
				//Set the ETV values (min and max)
				this.#setETV(tileDOM, item.data, etv_min);
				this.#setETV(tileDOM, item.data, etv_max);

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

			//Set the highlight color as needed - MUST be called AFTER setting type attributes
			this._processNotificationHighlight(tileDOM);

			// Note: Filtering is now done BEFORE sound playing (see above)
			// This ensures sounds only play for visible items

			// Emit grid events during normal operation or when fetching recent items
			// Always emit during fetch to ensure counts stay accurate
			if (!this._feedPaused || this._fetchingRecentItems) {
				// Debug: Log when new items are added
				if (this._settings.get("general.debugItemProcessing") || this._settings.get("general.debugTabTitle")) {
					console.log("[NotificationMonitor] New item added - FINAL STATE", {
						asin,
						isVisible,
						currentCount: this._tileCounter.getCount(),
						feedPaused: this._feedPaused,
						fetchingRecentItems: this._fetchingRecentItems,
						tileVisible: this.#isElementVisible(tileDOM),
						computedDisplay: window.getComputedStyle(tileDOM).display,
						inlineDisplay: tileDOM.dataset.display,
						typeHighlight: tileDOM.dataset.typeHighlight,
						typeZeroETV: tileDOM.dataset.typeZeroETV,
						filterType: this._filterType,
						timestamp: new Date().toISOString(),
					});
				}

				// During bulk operations (fetchingRecentItems), use debounced recount
				// For individual items, recount immediately
				if (this._fetchingRecentItems) {
					// Use debounced recount during bulk operations
					this._tileCounter.recountVisibleTiles(50, false, { isBulkOperation: true, source: "bulk-add" });
				} else {
					// Immediate recount for individual items
					this._tileCounter.recountVisibleTiles(0, true, { source: "single-add" });
				}
			}

			//Autotruncate the items if there are too many
			this.#autoTruncate(!this._feedPaused); //If we are paused, autotruncate will debounce itself.

			return tileDOM; //Return the DOM element for the tile.
		} finally {
			// Always remove from processing map when done
			this.#processingASINs.delete(asin);
		}
	}

	async addVariants(data) {
		if (this._monitorV3 && this._settings.isPremiumUser(2) && this._settings.get("general.displayVariantButton")) {
			if (this._itemsMgr.items.has(data.asin)) {
				const tile = this._itemsMgr.getItemTile(data.asin);
				if (tile) {
					if (data.variants && data.variants.length > 0) {
						// Process all variants in parallel for better performance
						await Promise.all(
							data.variants.map((variant) => tile.addVariant(variant.asin, variant.title, variant.etv))
						);
						tile.updateVariantCount();
					}
				}
			}
		}
	}

	/**
	 * Set the ETV for an item. Call it twice with min and max values to set a range.
	 * @param {object} notif - The DOM element of the tile
	 * @param {object} data - The item data
	 * @param {number} etv - The ETV value
	 * @returns {boolean} - True if the ETV was set, false otherwise
	 */
	async #setETV(notif, data, etv) {
		/*
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
			} = item.data
		*/
		if (!notif) {
			return false;
		}
		const asin = notif.dataset.asin;
		const etvObj = notif.querySelector("div.etv");
		const etvTxt = etvObj.querySelector("span.etv");
		const brendaAnnounce = notif.querySelector("#vh-announce-link-" + asin);

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

		// Re-evaluate keywords ONLY if:
		// 1. Keywords have ETV conditions AND
		// 2. The item hasn't already been matched to a keyword without ETV conditions
		const highlightKeywords = this._settings.get("general.highlightKeywords");
		const hasEtvConds = highlightKeywords && hasAnyEtvConditions(highlightKeywords);
		const currentlyHighlighted = notif.dataset.typeHighlight == 1;

		// Debug logging to understand duplicate processing
		if (this._settings.get("general.debugKeywords")) {
			console.log("[NotificationMonitor] #setETV keyword re-evaluation check:", {
				asin,
				hasHighlightKeywords: !!highlightKeywords,
				hasEtvConditions: hasEtvConds,
				currentlyHighlighted,
				willReEvaluate: hasEtvConds && data.title && !currentlyHighlighted,
				etvMin: etvObj.dataset.etvMin,
				etvMax: etvObj.dataset.etvMax,
				timestamp: Date.now(),
			});
		}

		// Skip re-evaluation if item is already highlighted (matched in stream processing)
		// and continue re-evaluation only for items that might match ETV conditions
		if (hasEtvConds && !currentlyHighlighted) {
			if (data.title) {
				// Check keyword match with new ETV values
				const matchedKeyword = await keywordMatch(
					highlightKeywords,
					data.title,
					etvObj.dataset.etvMin,
					etvObj.dataset.etvMax
				);

				const wasHighlighted = notif.dataset.typeHighlight == 1;
				const technicalBtn = this._gridContainer.querySelector("#vh-reason-link-" + asin + ">div");

				if (matchedKeyword !== false) {
					// Item matches a keyword
					if (technicalBtn) {
						// Debug logging for updating dataset
						if (this._settings.get("general.debugKeywords")) {
							console.log(
								`[NotificationMonitor] Updating technicalBtn.dataset.highlightkw for ASIN ${asin}: "${matchedKeyword}"`
							);
						}
						technicalBtn.dataset.highlightkw = matchedKeyword;
					}

					// Set the highlight flag
					notif.dataset.typeHighlight = 1;

					// Since we're in the !currentlyHighlighted block, this is always a new highlight
					// Play sound and move to top
					const tileVisible = this.#processNotificationFiltering(notif);

					// Play sound if visible or fetching
					if (
						(tileVisible || this._fetchingRecentItems) &&
						this._settings.get("notification.monitor.highlight.sound") != "0"
					) {
						this._soundPlayerMgr.play(TYPE_HIGHLIGHT);
					}

					// Move to top if not fetching and sort allows it
					if (!this._fetchingRecentItems && this._sortType !== TYPE_DATE_ASC) {
						this._moveNotifToTop(notif);
					}

					// Don't handle visibility change here - it will be handled by the caller
					// This prevents double counting when an item is both highlighted and zero ETV
				}
				// Note: No else block needed here because if we're in !currentlyHighlighted
				// and the item doesn't match keywords, it wasn't highlighted before and still isn't
			}
		} else if (hasEtvConds && currentlyHighlighted && data.title) {
			// Item is already highlighted, but we should check if the matched keyword has ETV conditions
			// that might invalidate the match now that we have actual ETV values
			const technicalBtn = this._gridContainer.querySelector("#vh-reason-link-" + asin + ">div");
			const currentKeyword = technicalBtn?.dataset.highlightkw;

			if (currentKeyword) {
				// Find the keyword object to check if it has ETV conditions
				const keywordObj = highlightKeywords.find(
					(kw) =>
						(typeof kw === "string" && kw === currentKeyword) ||
						(typeof kw === "object" && kw.word === currentKeyword)
				);

				// Only re-evaluate if the current keyword has ETV conditions
				if (keywordObj && typeof keywordObj === "object" && (keywordObj.etv_min || keywordObj.etv_max)) {
					const matchedKeyword = await keywordMatch(
						highlightKeywords,
						data.title,
						etvObj.dataset.etvMin,
						etvObj.dataset.etvMax
					);

					if (matchedKeyword === false) {
						// No longer matches with actual ETV values
						notif.dataset.typeHighlight = 0;
						delete technicalBtn.dataset.highlightkw;
						this.#processNotificationFiltering(notif);
					}
				}
			}
		}

		// Check hide keywords separately (not dependent on highlight keywords)
		if (this._settings.get("notification.hideList")) {
			const hideKeywords = this._settings.get("general.hideKeywords");
			if (hideKeywords) {
				if (data.title) {
					const matchedHideKeyword = await keywordMatch(
						hideKeywords,
						data.title,
						etvObj.dataset.etvMin,
						etvObj.dataset.etvMax
					);
					if (matchedHideKeyword !== false) {
						console.log("[setETV] Hide keyword matched for", data, matchedHideKeyword);
						// Remove (permanently "hide") the tile
						this._log.add(`NOTIF: Item ${asin} matched hide keyword ${matchedHideKeyword}. Hiding it.`);

						// Check if the tile is fully registered before attempting removal
						const element = this._itemsMgr.getItemDOMElement(asin);
						if (element) {
							// Tile is fully registered, safe to remove
							this.#removeTile(asin);
						} else {
							// Tile not fully registered yet (probably called during addTileInGrid)
							console.warn(`Hide keyword matched for ${asin} but tile not fully registered. Skipping.`);
						}
						return true; // Exit early since item is processed
					}
				}
			}
		}

		//Set the highlight color as needed
		this._processNotificationHighlight(notif);

		this.#disableGoldItemsForSilverUsers(notif);

		return true;
	}

	/**
	 * Check if an item has Zero ETV and handle visibility changes
	 * This is separated from #setETV to avoid duplicate checks when setting min/max
	 * @param {HTMLElement} notif - The notification element
	 */
	#checkZeroETVStatus(notif) {
		if (!notif) return;

		const etvObj = notif.querySelector("div.etv");
		if (!etvObj) return;

		// Debug logging for ETV status check
		if (this._settings.get("general.debugItemProcessing")) {
			const asin = notif.id?.replace("vh-notification-", "") || "unknown";
			console.log("[DEBUG-ETV-STYLING] Checking Zero ETV status", {
				asin,
				etvMin: etvObj.dataset.etvMin,
				etvMax: etvObj.dataset.etvMax,
				typeUnknownETV: notif.dataset.typeUnknownETV,
				typeZeroETV: notif.dataset.typeZeroETV,
				typeHighlight: notif.dataset.typeHighlight,
				currentFilterType: this._filterType,
				isUnknownETVFilter: this._filterType === TYPE_UNKNOWN_ETV,
				timestamp: new Date().toISOString(),
			});
		}

		// Clear unknown ETV flag since we now have an ETV value
		if (notif.dataset.typeUnknownETV == 1) {
			// Debug logging for unknown ETV flag clearing
			if (this._settings.get("general.debugItemProcessing")) {
				const asin = notif.id?.replace("vh-notification-", "") || "unknown";
				console.log("[DEBUG-ETV-STYLING] Clearing unknown ETV flag - item now has ETV data", {
					asin,
					wasUnknownETV: true,
					typeHighlight: notif.dataset.typeHighlight,
					typeZeroETV: notif.dataset.typeZeroETV,
					currentFilterType: this._filterType,
					isUnknownETVFilter: this._filterType === TYPE_UNKNOWN_ETV,
					TYPE_UNKNOWN_ETV_VALUE: TYPE_UNKNOWN_ETV,
					etvMin: etvObj.dataset.etvMin,
					etvMax: etvObj.dataset.etvMax,
					timestamp: new Date().toISOString(),
				});
			}

			notif.dataset.typeUnknownETV = 0;

			// Re-apply filter since the item no longer matches unknown ETV criteria
			if (this._filterType === TYPE_UNKNOWN_ETV) {
				// Item was visible on Unknown ETV filter but now has ETV data, so it should be hidden
				if (this._settings.get("general.debugItemProcessing")) {
					console.log("[DEBUG-ETV-STYLING] Hiding item that no longer matches Unknown ETV filter", {
						asin: notif.id?.replace("vh-notification-", "") || "unknown",
						filterType: this._filterType,
						timestamp: new Date().toISOString(),
					});
				}

				// Re-apply the filter to this specific item
				const newVisibility = this.#processNotificationFiltering(notif);

				if (this._settings.get("general.debugItemProcessing")) {
					console.log("[DEBUG-ETV-STYLING] Filter re-applied after clearing unknown ETV", {
						asin: notif.id?.replace("vh-notification-", "") || "unknown",
						newVisibility,
						shouldBeHidden: !newVisibility,
						timestamp: new Date().toISOString(),
					});
				}

				// IMPORTANT: Return early to prevent further processing that might re-show the item
				// The item should remain hidden on the Unknown ETV filter since it now has ETV data
				return;
			} else {
				// For other filters, just check if visibility changed
			}
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
					// Set the flag before calling the handler
					notif.dataset.typeZeroETV = 1;

					// Process filtering to update visibility based on the new flag
					this.#processNotificationFiltering(notif);

					// Only call the item found handler for sound and sorting, not for visibility
					// Pass skipFiltering=true to avoid duplicate processing
					this.#zeroETVItemFound(
						notif,
						this._settings.get("notification.monitor.zeroETV.sound") != "0",
						true
					);
				} finally {
					// Always remove from processing set
					this.#etvProcessingItems.delete(asin);
				}
			}
		} else {
			// Clear the zero ETV flag when item is not zero ETV
			if (notif.dataset.typeZeroETV == 1) {
				notif.dataset.typeZeroETV = 0;
				// Re-apply filtering to update visibility
				this.#processNotificationFiltering(notif);
			}
		}
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

		// Update the DOM element
		notif.dataset.tier = tier;
		const vvpDetailsBtn = notif.querySelector(".vvp-details-btn");
		if (vvpDetailsBtn) {
			vvpDetailsBtn.dataset.tier = tier;
		}

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

		const data = this._itemsMgr.items.get(asin)?.data;
		if (!data) {
			return false;
		}

		// Update the DOM element
		this.#setETV(notif, data, etv);

		// Check Zero ETV status after update
		this.#checkZeroETVStatus(notif);

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
				// Use atomic DOM update to prevent visual shifts
				// Build the new order in a document fragment
				const fragment = document.createDocumentFragment();
				const allItems = Array.from(this._gridContainer.children);

				// Remove the item from its current position
				allItems.splice(currentIndex, 1);

				// Insert at the target position
				allItems.splice(targetIndex, 0, notif);

				// Clone all items to the fragment to maintain DOM state
				allItems.forEach((item) => {
					fragment.appendChild(item.cloneNode(true));
				});

				// Replace all children atomically
				// This prevents the container from ever being empty
				this._gridContainer.replaceChildren(...fragment.childNodes);

				return true;
			}
		}

		return false;
	}

	/**
	 * Common handler for item found events
	 * This is the common code between zeroETVItemFound, highlightedItemFound, and regularItemFound
	 * @param {object} notif - The DOM element of the tile
	 * @param {string} itemType - The type of item (TYPE_ZEROETV, TYPE_HIGHLIGHT, TYPE_REGULAR)
	 * @param {boolean} playSoundEffect - If true, play the sound effect
	 * @param {boolean} skipFiltering - If true, skip re-processing filtering (used when called from ETV processing)
	 * @returns {boolean} - True if the item was found, false otherwise
	 * @private
	 */
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
		const shouldPlaySound = (tileVisible || this._fetchingRecentItems) && playSoundEffect;

		// Debug logging for sound playing logic
		if (this._settings.get("general.debugSound")) {
			console.log("[SOUND DEBUG] Sound decision in #handleItemFound:", {
				asin: notif.dataset?.asin,
				itemType,
				tileVisible,
				_fetchingRecentItems: this._fetchingRecentItems,
				playSoundEffect,
				shouldPlaySound,
				currentFilter: this._filterType,
				filterName:
					this._filterType === TYPE_HIGHLIGHT
						? "KW match only"
						: this._filterType === TYPE_HIGHLIGHT_OR_ZEROETV
							? "Zero ETV or KW match only"
							: this._filterType === TYPE_ZEROETV
								? "Zero ETV only"
								: "Other",
				typeHighlight: notif.dataset?.typeHighlight,
				typeZeroETV: notif.dataset?.typeZeroETV,
			});
		}

		if (shouldPlaySound) {
			this._soundPlayerMgr.play(itemType);
		}

		// Handle moving to top or sorting
		if (!this._fetchingRecentItems) {
			if (itemType === TYPE_ZEROETV) {
				// For price-based sorting, always trigger a re-sort
				if (this._sortType === TYPE_PRICE_DESC || this._sortType === TYPE_PRICE_ASC) {
					this.#sortItems();
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

	#sortItems() {
		// Get the sorted items from ItemsMgr
		const sortedItems = this._itemsMgr.sortItems();

		// Only proceed if we have items to sort
		if (sortedItems.length === 0) {
			// Clear empty container
			this._clearGridContainer();
			if (this._noShiftGrid) {
				this._noShiftGrid.insertPlaceholderTiles();
			}
			return;
		}

		// Create document fragment for efficient DOM manipulation
		const fragment = document.createDocumentFragment();

		// Add items to fragment in sorted orde
		sortedItems.forEach((sortedItem) => {
			const element = this._itemsMgr.getItemDOMElement(sortedItem.asin);

			if (element && element.parentNode) {
				fragment.appendChild(element);
			}
		});

		// Clear the grid container ONLY of remaining elements (placeholders, etc.)
		// The actual item elements are already in the fragment
		this._clearGridContainer();

		// Add sorted items back to the grid
		this._gridContainer.appendChild(fragment);

		// Let updatePlaceholders handle ALL placeholder management
		// This ensures placeholders are calculated fresh based on current state
		if (this._noShiftGrid) {
			this._noShiftGrid.resetEndPlaceholdersCount();
			this._noShiftGrid.insertPlaceholderTiles();
		}
	}

	/**
	 * Properly clear the grid container to prevent memory leaks
	 * This method ensures all DOM elements are properly removed without creating detached nodes
	 * @protected
	 */
	_clearGridContainer() {
		// For VineHelper tiles, we need to do proper cleanup before removal
		const children = Array.from(this._gridContainer.children);

		// Clean up VineHelper tiles properly - only for elements still in the grid
		for (const child of children) {
			// For placeholder tiles, just remove them directly
			if (child.classList.contains("vh-placeholder-tile")) {
				continue; // Will be removed by replaceChildren() below
			}

			// For item tiles, do basic cleanup before removal
			// Only clean up elements that are actually still in the grid
			const asin = child.id?.replace("vh-notification-", "");
			if (asin) {
				// Clean up any tooltips
				const linkElement = child.querySelector(".a-link-normal");
				if (linkElement) {
					this._tooltipMgr.removeTooltip(linkElement);
				}

				// Clean up dataset properties that might hold references
				if (child.dataset) {
					delete child.dataset.vhOriginalTitle;
					delete child.dataset.vhTileInstance;
				}

				// Clear any direct references on the element
				child.vhTileInstance = null;

				// Notify memory debugger BEFORE removing from DOM
				if (window.MEMORY_DEBUGGER) {
					window.MEMORY_DEBUGGER.markRemoved(child);
				}
			}
		}

		// Now use the most efficient method to clear the container
		if (this._gridContainer.replaceChildren) {
			// Modern browsers - most efficient method that prevents detached nodes
			this._gridContainer.replaceChildren();
		} else {
			// Fallback for older browsers
			while (this._gridContainer.firstChild) {
				this._gridContainer.removeChild(this._gridContainer.firstChild);
			}
		}
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
			this.#removeTile(asin);
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
		const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile");

		// Process all items synchronously for filter changes to avoid event storms
		// Skip logging during bulk operations
		for (let i = 0; i < tiles.length; i++) {
			this.#processNotificationFiltering(tiles[i], false, true); // skipLogging = true
		}

		// All filtering is complete

		// Trigger sort after filtering is complete
		this.#sortItems();

		// IMPORTANT: Recount visible tiles AFTER atomic update completes
		// This ensures the DOM is fully updated before counting
		// Use requestAnimationFrame to ensure DOM has been painted
		// NOTE: Skip recount if feed is paused - the feed-unpause event will handle it
		if (!this._feedPaused) {
			requestAnimationFrame(() => {
				if (this._tileCounter) {
					this._tileCounter.recountVisibleTiles(0, true, { isBulkOperation: true, source: "filter-change" }); // 0 wait time, priority = true, source = filter-change
				}
			});
		}
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

					//Mobile browsers handle window.open the way they want, a link with a target of _blank will open in a new tab more reliably.
					const options = item.getCoreInfo();
					const link = document.createElement("a");
					link.href = `https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${encodeURIComponent(JSON.stringify(options))}`;
					link.target = "_blank";
					link.rel = "noopener noreferrer";
					link.style.display = "none";

					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
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
				}, 300); // Reduced from 750ms for better responsiveness
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
			if (this._settings.get("general.debugSound")) {
				console.log("[SOUND DEBUG] Starting bulk fetch (last 100), setting _fetchingRecentItems = true");
			}
			this._fetchingRecentItems = true;
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
				if (this._settings.get("general.debugSound")) {
					console.log(
						"[SOUND DEBUG] Starting bulk fetch (filter change), setting _fetchingRecentItems = true"
					);
				}
				this._fetchingRecentItems = true;
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
			this.#sortItems();
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

	//Pause feed handler
	#handlePauseClick(isHoverPause = false) {
		this._feedPaused = !this._feedPaused;
		if (this._feedPaused) {
			this._feedPausedAmountStored = 0;
			document.getElementById("pauseFeed").value = "Resume Feed (0)";
			document.getElementById("pauseFeed-fixed").value = "Resume Feed (0)";

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
			// Check if any items were actually marked as paused (legacy code path)
			// In current implementation, items don't get marked with feedPaused="true"
			// Use for...of to avoid function allocation
			const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile");
			let visible = false;
			for (const node of tiles) {
				if (node.dataset.feedPaused == "true") {
					node.dataset.feedPaused = "false";
					visible = this.#processNotificationFiltering(node, true); //Unpausing,
					const displayValue = visible ? this.#getTileDisplayStyle() : "none";
					this.#setTileDisplay(node, displayValue);
				}
			}
			this._tileCounter.recountVisibleTiles(0, true, { isBulkOperation: true, source: "feed-unpause" });

			// Only emit unpause event for manual unpause, not hover unpause
			if (!isHoverPause && this._noShiftGrid) {
				this._noShiftGrid.insertEndPlaceholderTiles(0);
				this._noShiftGrid.insertPlaceholderTiles();
			}
		}
	}

	#setTileDisplay(tile, value) {
		tile.dataset.display = value;
		tile.style.display = value;
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

		// Clear processing map to prevent memory leaks
		if (this.#processingASINs) {
			this.#processingASINs.clear();
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

		// Clear count verification interval
		if (this._countVerificationInterval) {
			clearInterval(this._countVerificationInterval);
			this._countVerificationInterval = null;
			console.log("🧹 Cleared count verification interval"); // eslint-disable-line no-console
		}

		// Clear references
		this._gridContainer = null;

		console.log("✅ NotificationMonitor cleanup complete"); // eslint-disable-line no-console
	}
}

export { NotificationMonitor };
