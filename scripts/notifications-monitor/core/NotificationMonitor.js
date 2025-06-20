/*global chrome*/

//Todo: insertTileAccordingToETV and ETVChangeRepositioning are very similar. Could we merge some logic?

import { Tile } from "/scripts/ui/components/Tile.js";

import { YMDHiStoISODate } from "/scripts/core/utils/DateHelper.js";
import { keywordMatch, hasAnyEtvConditions } from "/scripts/core/utils/KeywordMatch.js";
import { ETV_REPOSITION_THRESHOLD } from "/scripts/core/utils/KeywordUtils.js";
import { escapeHTML, unescapeHTML, removeSpecialHTML } from "/scripts/core/utils/StringHelper.js";
import { MonitorCore } from "/scripts/notifications-monitor/core/MonitorCore.js";
import { Item } from "/scripts/core/models/Item.js";

// Memory debugging - only load if debug mode is enabled
let MemoryDebugger = null;

// Create a promise that resolves when the debugger is ready
window.MEMORY_DEBUGGER_READY = new Promise((resolve) => {
	if (window.DEBUG_MEMORY || localStorage.getItem("vh_debug_memory") === "true") {
		import("/scripts/notifications-monitor/debug/MemoryDebugger.js")
			.then((module) => {
				MemoryDebugger = module.default || module.MemoryDebugger || module;
				console.log("🔍 Memory Debugger loaded. Use window.MEMORY_DEBUGGER to access.");

				// Create the global instance immediately after loading
				if (!window.MEMORY_DEBUGGER && MemoryDebugger) {
					try {
						const debuggerInstance = new MemoryDebugger();

						// Try multiple ways to expose it globally
						window.MEMORY_DEBUGGER = debuggerInstance;
						globalThis.MEMORY_DEBUGGER = debuggerInstance;

						// If we're in a content script, try to expose to the page
						if (typeof unsafeWindow !== "undefined") {
							unsafeWindow.MEMORY_DEBUGGER = debuggerInstance;
						}

						console.log("🔍 Memory Debugger initialized. Starting monitoring...");

						// Also expose common methods directly for convenience
						const takeSnapshotFunc = function (name) {
							return debuggerInstance.takeSnapshot(name);
						};
						const generateReportFunc = function () {
							return debuggerInstance.generateReport();
						};

						window.takeSnapshot = takeSnapshotFunc;
						window.generateMemoryReport = generateReportFunc;
						globalThis.takeSnapshot = takeSnapshotFunc;
						globalThis.generateMemoryReport = generateReportFunc;

						// Double-check they're set
						if (typeof window.takeSnapshot !== "function") {
							console.error("Failed to set window.takeSnapshot");
						}
						if (typeof window.generateMemoryReport !== "function") {
							console.error("Failed to set window.generateMemoryReport");
						}

						console.log("📊 Quick access methods available:");
						console.log("  - takeSnapshot(name)");
						console.log("  - generateMemoryReport()");

						// Debug: Check if it's really set
						console.log("Debug: window.MEMORY_DEBUGGER is:", window.MEMORY_DEBUGGER);
						console.log("Debug: typeof window.MEMORY_DEBUGGER:", typeof window.MEMORY_DEBUGGER);

						// Provide instructions for accessing via promise
						console.log("📌 If direct access doesn't work, use:");
						console.log("   await window.MEMORY_DEBUGGER_READY");
						console.log("   // Then use the returned debugger instance");

						resolve(debuggerInstance);
					} catch (error) {
						console.error("Failed to create MemoryDebugger instance:", error);
						resolve(null);
					}
				} else {
					console.log("Debug: MEMORY_DEBUGGER already exists or MemoryDebugger not loaded");
					resolve(window.MEMORY_DEBUGGER || null);
				}
			})
			.catch((error) => {
				console.error("Failed to load Memory Debugger:", error);
				resolve(null);
			});
	} else {
		console.log("Memory debugging not enabled");
		resolve(null);
	}
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
	_noShiftGrid = null;
	_gridEventManager = null;
	_visibilityStateManager = null;

	#pinDebounceTimer = null;
	#pinDebounceClickable = true;

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

	// Cache for computed styles (Safari performance optimization)
	#computedStyleCache = new WeakMap();

	constructor(monitorV3 = false) {
		super(monitorV3);

		// Prevent direct instantiation of the abstract class
		if (this.constructor === NotificationMonitor) {
			throw new TypeError('Abstract class "NotificationMonitor" cannot be instantiated directly.');
		}

		// Memory debugger is initialized in the import callback above
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
	 * Check if an element is visible, handling Safari compatibility
	 * @param {HTMLElement} element - The element to check
	 * @returns {boolean} - True if the element is visible, false otherwise
	 */
	#isElementVisible(element) {
		if (!element) return false;

		if (this._env.isSafari()) {
			// Safari optimization: cache computed styles to avoid repeated expensive calls
			let cachedStyle = this.#computedStyleCache.get(element);
			if (!cachedStyle) {
				cachedStyle = window.getComputedStyle(element);
				this.#computedStyleCache.set(element, cachedStyle);
			}
			return cachedStyle.display !== "none";
		} else {
			return element.style.display !== "none";
		}
	}

	/**
	 * Clear the computed style cache when styles might have changed
	 * Call this when filters change or bulk style operations occur
	 */
	#invalidateComputedStyleCache() {
		this.#computedStyleCache = new WeakMap();
	}

	/**
	 * Handle visibility change detection and emit appropriate grid events
	 * @param {HTMLElement} element - The element to check and process
	 * @param {boolean} wasVisible - The visibility state before the change
	 */
	#handleVisibilityChange(element, wasVisible) {
		// Re-apply filtering and check if visibility changed
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
		// Use requestAnimationFrame for better visual stability
		requestAnimationFrame(() => {
			// Invalidate Safari computed style cache after bulk filtering
			if (this._env.isSafari()) {
				this.#invalidateComputedStyleCache();
			}

			// Recalculate visible count after filtering
			const newCount = this._countVisibleItems();
			// Update the visibility state manager with new count (V3 only)
			this._visibilityStateManager?.setCount(newCount);
			// Emit event for filter change with visible count
			this.#emitGridEvent("grid:items-filtered", { visibleCount: newCount });
		});
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

		const notificationTypeZeroETV = parseInt(node.dataset.typeZeroETV) === 1;
		const notificationTypeHighlight = parseInt(node.dataset.typeHighlight) === 1;
		const queueType = node.dataset.queue;

		//Feed Paused
		if (node.dataset.feedPaused == "true") {
			node.style.display = "none";
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
				node.style.display = "none";
				return false;
			}
		}

		// Search filter - if search text is not empty, check if item matches
		if (this._searchText.trim()) {
			const title = node.querySelector(".a-truncate-full")?.innerText?.toLowerCase() || "";
			if (!title.includes(this._searchText.toLowerCase().trim())) {
				node.style.display = "none";
				return false;
			}
		}

		const displayStyle = this.#getTileDisplayStyle();

		if (this._filterType == -1) {
			node.style.display = displayStyle;
		} else if (this._filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
			node.style.display = notificationTypeZeroETV || notificationTypeHighlight ? displayStyle : "none";
		} else if (this._filterType == TYPE_HIGHLIGHT) {
			node.style.display = notificationTypeHighlight ? displayStyle : "none";
		} else if (this._filterType == TYPE_ZEROETV) {
			node.style.display = notificationTypeZeroETV ? displayStyle : "none";
		} else if (this._filterType == TYPE_REGULAR) {
			node.style.display = !notificationTypeZeroETV && !notificationTypeHighlight ? displayStyle : "none";
		}

		//Queue filter
		let styleDisplay;
		if (this._env.isSafari()) {
			styleDisplay = window.getComputedStyle(node);
		} else {
			styleDisplay = node.style.display;
		}
		if (styleDisplay == "flex" || styleDisplay == "block") {
			if (this._filterQueue == "-1") {
				return true;
			} else {
				node.style.display = queueType == this._filterQueue ? this.#getTileDisplayStyle() : "none";
				return queueType == this._filterQueue;
			}
		} else {
			return false;
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
		this._fetchingRecentItems = false;

		if (this._feedPaused) {
			//Unbuffer the feed
			this.#handlePauseClick();
		} else {
			//Can happen if the user click unpause while the feed is filling.
		}

		// Always emit event to update placeholders after fetching recent items
		// Get the count from VisibilityStateManager if available, otherwise count manually
		const visibleCount = this._visibilityStateManager
			? this._visibilityStateManager.getCount()
			: this._countVisibleItems();
		this.#emitGridEvent("grid:fetch-complete", { visibleCount });

		// Emit event to trigger sorting instead of calling directly
		this.#emitGridEvent("grid:sort-needed");
	}

	/**
	 * Bulk remove items from the monitor
	 * @param {Set} asinsToKeep - A Set of ASINs to process
	 * @param {boolean} isKeepSet - If true, keep the items in the array and delete all other items, otherwise remove them
	 */
	#bulkRemoveItems(arrASINs, isKeepSet = false) {
		// Count visible items being removed before the operation
		let visibleRemovedCount = 0;

		this._preserveScrollPosition(() => {
			// Always use the optimized container replacement approach
			// Create a new empty container
			const newContainer = this._gridContainer.cloneNode(false); //Clone the container, but not the children items

			// Create a new items map to store the updated collection
			const newItems = new Map();
			const newImageUrls = new Set();

			// First, collect items to keep and items to remove
			const itemsToKeep = [];
			this._itemsMgr.items.forEach((item, asin) => {
				const shouldKeep = isKeepSet ? arrASINs.has(asin) : !arrASINs.has(asin);

				if (shouldKeep && item.element) {
					itemsToKeep.push({ asin, item });
					// Keep track of the image URL for duplicate detection
					if (item.data.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
						newImageUrls.add(item.data.img_url);
					}
				} else if (!shouldKeep) {
					// Count visible items being removed
					if (item.element && this.#isElementVisible(item.element)) {
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

			// Sort the items to keep according to current sort type
			const sortedItems = this._itemsMgr.sortItems();

			// Add items to new container in sorted order
			sortedItems.forEach((sortedItem) => {
				// Find this item in our itemsToKeep
				const keepItem = itemsToKeep.find((k) => k.asin === sortedItem.asin);
				if (keepItem && keepItem.item.element) {
					newContainer.appendChild(keepItem.item.element);
					newItems.set(keepItem.asin, keepItem.item);
				}
			});

			// Replace the old container with the new one
			this._gridContainer.parentNode.replaceChild(newContainer, this._gridContainer);
			this._gridContainer = newContainer;

			if (this._noShiftGrid) {
				this._noShiftGrid.updateGridContainer(this._gridContainer);
			}

			// Reattach event listeners to the new container
			this._createListeners(true); //True to limit the creation of a listener to the grid container only.

			// Update the data structures
			this._itemsMgr.items = newItems;
			this._itemsMgr.imageUrls = newImageUrls;
		});

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
	 * Clear all unavailable items from the monitor
	 */
	#clearUnavailableItems() {
		// Get all unavailable ASINs
		const unavailableAsins = new Set();

		this._itemsMgr.items.forEach((item, asin) => {
			if (item.data.unavailable) {
				unavailableAsins.add(asin);
			}
		});

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

				// Handle visibility change and emit events if needed
				this.#handleVisibilityChange(element, wasVisible);

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
				// For date descending (default), insert at the beginning
				this._gridContainer.insertBefore(fragment, this._gridContainer.firstChild);
			}
		});

		// Store a reference to the DOM element
		const wasMarkedUnavailable = this._itemsMgr.storeItemDOMElement(asin, tileDOM); //Store the DOM element
		const tile = this._itemsMgr.getItemTile(asin);

		// Track tile creation for memory debugging
		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.trackTile(tileDOM, asin);
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
		if (KWsMatch) {
			this.#highlightedItemFound(tileDOM, true); //Play the highlight sound
		} else if (parseFloat(etv_min) === 0) {
			this.#zeroETVItemFound(tileDOM, true); //Play the zeroETV sound
		} else {
			this.#regularItemFound(tileDOM, true); //Play the regular sound
		}

		//Process the bluring
		if (BlurKWsMatch) {
			this._blurItemFound(tileDOM);
		}

		//If we received ETV data (ie: Fetch last 100), process them
		if (etv_min != null && etv_max != null) {
			//Set the ETV but take no action on it
			this.#setETV(tileDOM, etv_min);
			this.#setETV(tileDOM, etv_max);

			//We found a zero ETV item, but we don't want to play a sound just yet
			//if (parseFloat(etv_min) === 0) {
			//?? Why are we calling this again?
			//	this.#zeroETVItemFound(tileDOM, false); //Ok now process 0etv, but no sound
			//}
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

		//Set the highlight color as needed
		this._processNotificationHighlight(tileDOM);

		//Check gold tier status for this item
		this.#disableGoldItemsForSilverUsers(tileDOM);

		if (this._mostRecentItemDate == null || date > this._mostRecentItemDate) {
			this._mostRecentItemDateDOM.innerText = this._formatDate(date);
			this._mostRecentItemDate = date;
		}

		//Apply the filters
		const isVisible = this.#processNotificationFiltering(tileDOM);

		// Emit grid events during normal operation or when fetching recent items
		// Always emit during fetch to ensure counts stay accurate
		if (!this._feedPaused || this._fetchingRecentItems) {
			// Emit event immediately to avoid visual delays
			this.#emitGridEvent("grid:items-added", { count: isVisible ? 1 : 0 });
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

		//Update the ETV value in the hidden fields
		let oldMaxValue = etvObj.dataset.etvMax; //Used to determine if a new 0ETV was found
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
		if (highlightKeywords && hasAnyEtvConditions(highlightKeywords)) {
			const title = notif.querySelector(".a-truncate-full").innerText;
			if (title) {
				// Check keyword match with new ETV values
				const matchedKeyword = await keywordMatch(
					highlightKeywords,
					title,
					etvObj.dataset.etvMin,
					etvObj.dataset.etvMax
				);

				const wasHighlighted = notif.dataset.typeHighlight == 1;
				const technicalBtn = this._gridContainer.querySelector("#vh-reason-link-" + asin + ">div");

				if (matchedKeyword !== false) {
					// Item matches a keyword
					if (technicalBtn) {
						technicalBtn.dataset.highlightkw = matchedKeyword;
					}

					// Set the highlight flag
					notif.dataset.typeHighlight = 1;

					if (!wasHighlighted) {
						// New highlight - play sound and move to top
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
					} else {
						// Already highlighted - just update visibility
						this.#processNotificationFiltering(notif);
					}
				} else if (wasHighlighted) {
					// Was highlighted but no longer matches - clear highlight
					notif.dataset.typeHighlight = 0;
					if (technicalBtn) {
						delete technicalBtn.dataset.highlightkw;
					}
					this.#processNotificationFiltering(notif);
				}
			}
		}

		// Check hide keywords separately (not dependent on highlight keywords)
		if (this._settings.get("notification.hideList")) {
			const hideKeywords = this._settings.get("general.hideKeywords");
			if (hideKeywords) {
				const title = notif.querySelector(".a-truncate-full").innerText;
				if (title) {
					const matchedHideKeyword = await keywordMatch(
						hideKeywords,
						title,
						etvObj.dataset.etvMin,
						etvObj.dataset.etvMax
					);
					if (matchedHideKeyword !== false) {
						// Remove (permanently "hide") the tile
						this._log.add(`NOTIF: Item ${asin} matched hide keyword ${matchedHideKeyword}. Hiding it.`);
						this.#removeTile(notif, asin);
						return true; // Exit early since item is removed
					}
				}
			}
		}

		//zero ETV found, highlight the item accordingly
		if (parseFloat(etvObj.dataset.etvMin) == 0) {
			// Always set typeZeroETV = 1 when ETV is 0, regardless of previous state
			this.#zeroETVItemFound(notif, this._settings.get("notification.monitor.zeroETV.sound") != "0");
		} else {
			// Clear the zero ETV flag when item is not zero ETV
			if (notif.dataset.typeZeroETV == 1) {
				notif.dataset.typeZeroETV = 0;
				// Re-apply filtering to update visibility
				this.#processNotificationFiltering(notif);
			}
		}

		//Set the highlight color as needed
		this._processNotificationHighlight(notif);

		this.#disableGoldItemsForSilverUsers(notif);

		return true;
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

		// CRITICAL: Check if visibility changed due to ETV update
		// For example: item with unknown ETV -> zero ETV with Zero ETV filter active
		this.#handleVisibilityChange(notif, wasVisible);

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
	 * @returns {boolean} - True if the item was found, false otherwise
	 * @private
	 */
	#handleItemFound(notif, itemType, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		// Set dataset properties based on item type
		if (itemType === TYPE_ZEROETV) {
			notif.dataset.typeZeroETV = 1;
		} else if (itemType === TYPE_HIGHLIGHT) {
			notif.dataset.typeHighlight = 1;
		}

		const tileVisible = this.#processNotificationFiltering(notif);

		// Play sound effect if conditions are met
		if ((tileVisible || this._fetchingRecentItems) && playSoundEffect) {
			this._soundPlayerMgr.play(itemType);
		}

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
	#zeroETVItemFound(notif, playSoundEffect = true) {
		return this.#handleItemFound(notif, TYPE_ZEROETV, playSoundEffect);
	}

	#highlightedItemFound(notif, playSoundEffect = true) {
		return this.#handleItemFound(notif, TYPE_HIGHLIGHT, playSoundEffect);
	}

	#regularItemFound(notif, playSoundEffect = true) {
		return this.#handleItemFound(notif, TYPE_REGULAR, playSoundEffect);
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
		// Use for...of instead of forEach to avoid function allocation
		const tiles = this._gridContainer.querySelectorAll(".vvp-item-tile");
		for (const node of tiles) {
			this.#processNotificationFiltering(node);
		}
	}

	#mouseoverHandler(e) {
		//Handle the See Details button
		if (
			this.#eventClosestElementLocator(e, ".vh-btn-container", (event, icon) => {
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
		const clearMonitorHandler = async (event) => {
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
		const clearUnavailableHandler = async (event) => {
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
		const fetchLast100Handler = async (event) => {
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
			const fetchLast12hrsHandler = async (event) => {
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
		const sortQueueHandler = async (event) => {
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
		const filterTypeHandler = (event) => {
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
		const filterQueueHandler = (event) => {
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
		const autoTruncateHandler = (event) => {
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
		const autoTruncateLimitHandler = (event) => {
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
			for (const node of tiles) {
				if (node.dataset.feedPaused == "true") {
					node.dataset.feedPaused = "false";
					this.#processNotificationFiltering(node);
				}
			}

			// Update visibility count after unpause
			// If we have a VisibilityStateManager, use its count; otherwise recount
			if (this._visibilityStateManager) {
				// Trust the incremental updates that happened during fetch
				const currentCount = this._visibilityStateManager.getCount();
				this._updateTabTitle(currentCount);
			} else {
				// Fallback for monitors without VisibilityStateManager
				const newCount = this._countVisibleItems();
				this._updateTabTitle(newCount);
			}

			// Only emit unpause event for manual unpause, not hover unpause
			if (!isHoverPause) {
				this.#emitGridEvent("grid:unpaused");
			}
		}
	}
	/**
	 * Clean up all event listeners and references
	 * This method should be called when the monitor is being destroyed
	 * to prevent memory leaks
	 */
	destroy() {
		console.log("🧹 Destroying NotificationMonitor and cleaning up event listeners...");

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

		// Clear references
		this._gridContainer = null;
		this._visibilityStateManager = null;

		console.log("✅ NotificationMonitor cleanup complete");
	}
}

export { NotificationMonitor };
