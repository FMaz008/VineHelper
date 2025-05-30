//Todo: insertTileAccordingToETV and ETVChangeRepositioning are very similar. Could we merge some logic?

import { getRecommendationTypeFromQueue, generateRecommendationString } from "../Grid.js";
import { Tile } from "../Tile.js";

import { YMDHiStoISODate } from "../DateHelper.js";
import { keywordMatch } from "../service_worker/keywordMatch.js";
import { unescapeHTML, removeSpecialHTML } from "../StringHelper.js";
import { MonitorCore } from "./MonitorCore.js";

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
	_waitTimer; //Timer which wait a short delay to see if anything new is about to happen
	_gridContainer = null;
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

	#pinDebounceTimer = null;
	#pinDebounceClickable = true;

	constructor(monitorV3 = false) {
		super(monitorV3);

		// Prevent direct instantiation of the abstract class
		if (this.constructor === NotificationMonitor) {
			throw new TypeError('Abstract class "NotificationMonitor" cannot be instantiated directly.');
		}
	}

	//###################################################################
	// DOM element related methods
	//###################################################################

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

		if (this._filterType == -1) {
			node.style.display = this._monitorV2 ? "block" : "flex";
		} else if (this._filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
			node.style.display =
				notificationTypeZeroETV || notificationTypeHighlight ? (this._monitorV2 ? "block" : "flex") : "none";
		} else if (this._filterType == TYPE_HIGHLIGHT) {
			node.style.display = notificationTypeHighlight ? (this._monitorV2 ? "block" : "flex") : "none";
		} else if (this._filterType == TYPE_ZEROETV) {
			node.style.display = notificationTypeZeroETV ? (this._monitorV2 ? "block" : "flex") : "none";
		} else if (this._filterType == TYPE_REGULAR) {
			node.style.display =
				!notificationTypeZeroETV && !notificationTypeHighlight ? (this._monitorV2 ? "block" : "flex") : "none";
		}

		//Queue filter
		if (node.style.display == "flex" || node.style.display == "block") {
			if (this._filterQueue == "-1") {
				return true;
			} else {
				node.style.display = queueType == this._filterQueue ? (this._monitorV2 ? "block" : "flex") : "none";
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
	fetchRecentItemsEnd() {
		if (this._feedPaused) {
			//Unbuffer the feed
			document.getElementById("pauseFeed").click();
		}
		this._fetchingRecentItems = false;

		this.#processNotificationSorting();
		this._updateTabTitle();
	}

	/**
	 * Bulk remove items from the monitor
	 * @param {Set} asinsToKeep - A Set of ASINs to process
	 * @param {boolean} isKeepSet - If true, keep the items in the array and delete all other items, otherwise remove them
	 */
	#bulkRemoveItems(arrASINs, isKeepSet = false) {
		this._preserveScrollPosition(() => {
			// Always use the optimized container replacement approach
			// Create a new empty container
			const newContainer = this._gridContainer.cloneNode(false); //Clone the container, but not the children items

			// Create a new items map to store the updated collection
			const newItems = new Map();
			const newImageUrls = new Set();

			// Efficiently process all items
			this._itemsMgr.items.forEach((item, asin) => {
				const shouldKeep = isKeepSet ? arrASINs.has(asin) : !arrASINs.has(asin);

				if (shouldKeep && item.element) {
					// Add this item to the new container
					newContainer.appendChild(item.element);
					newItems.set(asin, item);

					// Keep track of the image URL for duplicate detection
					if (item.data.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
						newImageUrls.add(item.data.img_url);
					}
				}
			});

			// Replace the old container with the new one
			this._gridContainer.parentNode.replaceChild(newContainer, this._gridContainer);
			this._gridContainer = newContainer;

			// Reattach event listeners to the new container
			this._createListeners(true); //True to limit the creation of a listener to the grid container only.

			// Update the data structures
			this._itemsMgr.items = newItems;
			this._itemsMgr.imageUrls = newImageUrls;
		});

		// Update the tab counter
		this._updateTabTitle();
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
		const runTruncate = () => {
			// Auto truncate
			if (this._autoTruncateEnabled) {
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

					// Identify which items to keep and which to remove
					const itemsToKeep = itemsArray.slice(itemsArray.length - max);
					const asinsToKeep = new Set(itemsToKeep.map((item) => item.asin));

					// Use bulk removal method with the optimized approach for large sets
					this.#bulkRemoveItems(asinsToKeep, true);
				}
			}
		};

		if (forceRun) {
			runTruncate();
		} else {
			// Set a new debounce timer
			this._autoTruncateDebounceTimer = setTimeout(runTruncate, 500); // 500ms debounce delay
		}
	}

	/**
	 * Clear all visible items from the monitor
	 */
	#clearAllVisibleItems() {
		this._preserveScrollPosition(() => {
			// Get the asin of all visible items
			const visibleItems = document.querySelectorAll(".vvp-item-tile:not([style*='display: none'])");
			const asins = new Set();
			visibleItems.forEach((item) => {
				const asin = item.dataset.asin;
				if (asin) {
					asins.add(asin);
				}
			});
			// Remove each visible item
			this.#bulkRemoveItems(asins, false);
		});
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

		// Use the bulk remove method, letting it decide the optimal approach
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
	 * @param {object} itemData - JSON object containing the item data
	 * @returns {false|object} - Return the DOM element of the tile if added, false otherwise
	 */
	async addTileInGrid(itemData) {
		if (!itemData) {
			return false;
		}

		itemData.unavailable = itemData.unavailable == 1;
		itemData.typeHighlight = itemData.KWsMatch ? 1 : 0;
		itemData.typeZeroETV = itemData.etv_min !== null && parseFloat(itemData.etv_min) === 0 ? 1 : 0;
		itemData.title = unescapeHTML(unescapeHTML(itemData.title));
		itemData.date = YMDHiStoISODate(itemData.date); //Convert server date time to local date time
		itemData.date_added = YMDHiStoISODate(itemData.date_added); //Convert server date time to local date time
		const {
			asin,
			queue,
			tier,
			date,
			date_added,
			title,
			img_url,
			is_parent_asin,
			enrollment_guid,
			etv_min,
			etv_max,
			reason,
			KW,
			KWsMatch,
			BlurKW,
			BlurKWsMatch,
			unavailable,
		} = itemData;
		const recommendationType = getRecommendationTypeFromQueue(queue); //grid.js
		const recommendationId = generateRecommendationString(recommendationType, asin, enrollment_guid); //grid.js

		// If the notification already exists, update the data and return the existing DOM element
		if (this._itemsMgr.items.has(asin)) {
			const element = this._itemsMgr.getItemDOMElement(asin);
			if (element) {
				this._log.add(`NOTIF: Item ${asin} already exists, updating RecommendationId.`);
				// Update the data
				this._itemsMgr.addItemData(asin, itemData);

				// Update recommendationId in the DOM
				// it's possible that the input element was removed as part of the de-duplicate image process or the gold tier check
				element.dataset.recommendationId = recommendationId;
				const inputElement = element.querySelector(`input[data-asin='${asin}']`);
				if (inputElement) {
					inputElement.dataset.recommendationId = recommendationId;
				}

				if (!itemData.unavailable) {
					this._enableItem(element); //Return the DOM element of the tile.
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
		this._itemsMgr.addItemData(asin, itemData);

		// Generate the search URL
		let search_url;
		if (
			this._settings.isPremiumUser(2) &&
			this._settings.get("general.searchOpenModal") &&
			is_parent_asin != null &&
			enrollment_guid != null
		) {
			search_url = `https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`;
		} else {
			let truncatedTitle = title.length > 40 ? title.substr(0, 40).split(" ").slice(0, -1).join(" ") : title;
			truncatedTitle = removeSpecialHTML(truncatedTitle);
			const search_url_slug = encodeURIComponent(truncatedTitle);
			search_url = `https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?search=${search_url_slug}`;
		}

		let prom2 = await this._tpl.loadFile("view/" + this._itemTemplateFile);
		this._tpl.setVar("id", asin);
		this._tpl.setVar("domain", this._i13nMgr.getDomainTLD());
		this._tpl.setVar("img_url", img_url);
		this._tpl.setVar("asin", asin);
		this._tpl.setVar("tier", tier);
		this._tpl.setVar("date_added", date_added);
		this._tpl.setVar("date_received", new Date());
		this._tpl.setVar("date_sent", date);
		this._tpl.setVar("date_displayed", this._formatDate(date));
		this._tpl.setVar("feedPaused", this._feedPaused);
		this._tpl.setVar("queue", queue);
		this._tpl.setVar("description", title);
		this._tpl.setVar("reason", reason);
		this._tpl.setVar("highlightKW", KW);
		this._tpl.setVar("blurKW", BlurKW);
		this._tpl.setVar("is_parent_asin", is_parent_asin); //"true" or "false"
		this._tpl.setVar("enrollment_guid", enrollment_guid);
		this._tpl.setVar("recommendationType", recommendationType);
		this._tpl.setVar("recommendationId", recommendationId);
		this._tpl.setVar("search_url", search_url);
		this._tpl.setIf("is_parent_asin", is_parent_asin == "true" || is_parent_asin === true);
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

		const tile = this._itemsMgr.setTile(asin, tileDOM);

		if (this._monitorV3 && this._settings.isPremiumUser(2) && this._settings.get("general.displayVariantButton")) {
			if (is_parent_asin && itemData.variants) {
				for (const variant of itemData.variants) {
					await tile.addVariant(variant.asin, variant.title, variant.etv);
				}
				tile.updateVariantCount();
			}
		}

		// Store a reference to the DOM element
		this._itemsMgr.storeItemDOMElement(asin, tileDOM);

		// Check if the item is already pinned and update the pin icon
		if (this._settings.get("pinnedTab.active")) {
			const isPinned = await this._pinMgr.checkIfPinned(asin);
			if (isPinned) {
				this._pinMgr.pinItem(asin, queue, title, img_url, is_parent_asin ? "true" : "false", enrollment_guid);
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
			//sleep for 5ms to allow the value to be updated
			await new Promise((resolve) => setTimeout(resolve, 5));
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
		this.#processNotificationFiltering(tileDOM);

		//Update the tab title:
		//User a timer to avoid the Fetch Last 100 to call this 100 times, which slow things down.
		window.clearTimeout(this._waitTimer);
		this._waitTimer = window.setTimeout(() => {
			this._updateTabTitle();
		}, 250);

		//Autotruncate the items if there are too many
		this.#autoTruncate();

		return tileDOM; //Return the DOM element for the tile.
	}

	async addVariants(data) {
		if (this._settings.isPremiumUser(2) && this._settings.get("general.displayVariantButton")) {
			if (this._itemsMgr.items.has(data.asin)) {
				const tile = this._itemsMgr.getTile(data.asin);
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
	 * Remove an item from the monitor
	 * @param {object} tile - The DOM element of the tile
	 * @param {string} asin - The ASIN of the item
	 * @param {boolean} countTotalTiles - If true, update the tab counter
	 */
	#removeTile(tile, asin, countTotalTiles = true) {
		if (!tile || !asin) {
			return;
		}

		// Get the item data to access its image URL
		const item = this._itemsMgr.items.get(asin);
		const imgUrl = item?.data?.img_url;

		// Remove the tooltip
		const a = tile.querySelector(".a-link-normal");
		if (a) {
			this._tooltipMgr.removeTooltip(a);
		}

		// Remove from data structures
		this._itemsMgr.items.delete(asin);

		// Also remove the image URL from the set if duplicate detection is enabled
		if (imgUrl && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this._itemsMgr.imageUrls.delete(imgUrl);
		}

		// Remove the element from DOM with scroll position preserved
		this._preserveScrollPosition(() => {
			tile.remove();
		});
		tile = null;

		if (countTotalTiles) {
			this._updateTabTitle(); // Update the tab counter
		}
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

		//If a new ETV came in, we want to check if the item now match a keywords with an ETV condition.
		//If the item is already highlighted, we don't need to check if we need to highlight it or hide it.
		let skipHighlightCheck = notif.dataset.typeHighlight == 1;
		if (!skipHighlightCheck) {
			//No need to re-highlight if the item is already highlighted.
			//We don't want to highlight an item that is getting its ETV set initially (processAsZeroETVFound==false) before another pass of highlighting will be done shortly after.
			const title = notif.querySelector(".a-truncate-full").innerText;
			if (title) {
				//Check if we need to highlight the item now what we have an ETV
				const val = await keywordMatch(
					this._settings.get("general.highlightKeywords"),
					title,
					etvObj.dataset.etvMin,
					etvObj.dataset.etvMax
				);

				if (val !== false) {
					//We got a keyword match, highlight the item
					const technicalBtn = document.querySelector("#vh-reason-link-" + asin + ">div");
					if (technicalBtn) {
						technicalBtn.dataset.highlightkw = val;
					}
					this.#highlightedItemFound(
						notif,
						this._settings.get("notification.monitor.highlight.sound") != "0"
					);
				} else if (this._settings.get("notification.hideList")) {
					//Check if we need to hide the item
					const val2 = await keywordMatch(
						this._settings.get("general.hideKeywords"),
						title,
						etvObj.dataset.etvMin,
						etvObj.dataset.etvMax
					);
					if (val2 !== false) {
						//Remove (permanently "hide") the tile
						this._log.add(`NOTIF: Item ${asin} matched hide keyword ${val2}. Hidding it.`);
						this.#removeTile(notif, asin);
					}
				}
			}
		}

		//zero ETV found, highlight the item accordingly
		if (oldMaxValue == "" && parseFloat(etvObj.dataset.etvMin) == 0) {
			this.#zeroETVItemFound(notif, this._settings.get("notification.monitor.zeroETV.sound") != "0");
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

		// Update the DOM element
		notif.dataset.tier = tier;
		const vvpDetailsBtn = notif.querySelector(".vvp-details-btn");
		if (vvpDetailsBtn) {
			vvpDetailsBtn.dataset.tier = tier;
		}

		this.#processNotificationFiltering(notif);

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

		// Update the DOM element
		this.#setETV(notif, etv);

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
		if (oldETV === null || Math.abs(newETV - oldETV) > 0.01) {
			// Remove the element from DOM
			notif.remove();

			// Find the correct position to insert
			const newPrice = parseFloat(newETV);
			let insertPosition = null;

			// Find the first item with a lower price
			for (const [existingAsin, item] of this._itemsMgr.items.entries()) {
				// Skip the current item or items without elements
				if (existingAsin === asin || !item.element || !item.element.parentNode) {
					continue;
				}

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
				this._gridContainer.insertBefore(notif, insertPosition);
			} else {
				// If no position found or item has highest price, append to the end
				this._gridContainer.appendChild(notif);
			}
			return true;
		}

		return false;
	}

	/**
	 * Handle the zero ETV item found event
	 * @param {object} notif - The DOM element of the tile
	 * @param {boolean} playSoundEffect - If true, play the zero ETV sound effect
	 * @returns {boolean} - True if the zero ETV item was found, false otherwise
	 */
	#zeroETVItemFound(notif, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		notif.dataset.typeZeroETV = 1;
		const tileVisible = this.#processNotificationFiltering(notif);

		//Play the zero ETV sound effect
		if ((tileVisible || this._fetchingRecentItems) && playSoundEffect) {
			this._soundPlayerMgr.play(TYPE_ZEROETV);
		}

		//Move the notification to the top only if we're not using price-based sorting
		if (!this._fetchingRecentItems) {
			// Only move to top if we're NOT using price sort
			if (this._sortType === TYPE_DATE_DESC && this._settings.get("notification.monitor.bump0ETV")) {
				this._moveNotifToTop(notif);
			} else {
				// If sorting by price is active, just resort after identifying as zero ETV
				this.#processNotificationSorting();
			}
		}
	}

	#highlightedItemFound(notif, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		notif.dataset.typeHighlight = 1;
		const tileVisible = this.#processNotificationFiltering(notif);

		//Play the highlight sound effect
		if ((tileVisible || this._fetchingRecentItems) && playSoundEffect) {
			this._soundPlayerMgr.play(TYPE_HIGHLIGHT);
		}

		//Move the notification to the top
		if (!this._fetchingRecentItems && this._sortType !== TYPE_DATE_ASC) {
			this._moveNotifToTop(notif);
		}
	}

	#regularItemFound(notif, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		const tileVisible = this.#processNotificationFiltering(notif);

		//Play the regular notification sound effect.
		if ((tileVisible || this._fetchingRecentItems) && playSoundEffect) {
			this._soundPlayerMgr.play(TYPE_REGULAR);
		}
	}

	/**
	 * Sort the DOM items according to the _items map
	 */
	async #processNotificationSorting() {
		const container = document.getElementById("vvp-items-grid");
		if (!container) return;

		await this._preserveScrollPosition(async () => {
			// Sort the items - reuse the sorting logic from #sortItems
			const sortedItems = this._itemsMgr.sortItems();

			// Only proceed if we have items
			if (!sortedItems || sortedItems.length === 0) return;

			// Filter out any items without DOM elements
			const validItems = sortedItems.filter((item) => item.element);

			// Create a DocumentFragment for better performance
			const fragment = document.createDocumentFragment();

			// Add items to fragment in sorted order
			validItems.forEach((item) => {
				if (item.element.parentNode) {
					item.element.remove();
				}
				fragment.appendChild(item.element);
			});

			// Append all items at once
			container.appendChild(fragment);
		});
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

		const asin = target.dataset.asin;
		const queue = target.dataset.queue;

		let etv = document.querySelector("#vh-notification-" + asin + " .etv").dataset.etvMax;

		this._brendaMgr.announce(asin, etv, queue, this._i13nMgr.getDomainTLD());
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
			// Pin the item
			const isParentAsin = target.dataset.isParentAsin;
			const enrollmentGUID = target.dataset.enrollmentGuid;
			const queue = target.dataset.queue;
			const thumbnail = target.dataset.thumbnail;

			// Update the icon
			this._pinMgr.pinItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID);

			this._displayToasterNotification({
				title: `Item ${asin} pinned.`,
				lifespan: 3,
				content: title,
			});
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

	#mouseoverHandler(e) {
		//Handle the See Details button
		if (
			this.#eventClosestElementLocator(e, ".vh-btn-container", (event, icon) => {
				e.preventDefault();
				if (!this._feedPaused) {
					this.#pausedByMouseoverSeeDetails = true;
					document.getElementById("pauseFeed").click();
				}
			})
		)
			return;

		if (this.#pausedByMouseoverSeeDetails) {
			this.#pausedByMouseoverSeeDetails = false;
			if (this._feedPaused) {
				document.getElementById("pauseFeed").click();
			}
		}
	}

	/**
	 * Handle all click events in the monitor
	 * @param {Event} e - The click event
	 */
	#clickHandler(e) {
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
				const asin = seeDetailsBtn.dataset.asin;
				const queue = seeDetailsBtn.dataset.queue;
				const is_parent_asin = seeDetailsBtn.dataset.isParentAsin;
				const enrollment_guid = seeDetailsBtn.dataset.enrollmentGuid;

				//Store the function reference as a property on the element
				window.open(
					`https://www.amazon.${this._i13nMgr.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin};${enrollment_guid}`,
					"_blank"
				);

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
		// Bind the click handler to the instance and then add as event listener
		this._gridContainer.addEventListener("click", (e) => this.#clickHandler(e));

		if (this._settings.get("notification.monitor.mouseoverPause")) {
			document.addEventListener("mouseover", (e) => this.#mouseoverHandler(e));
		}
		if (reattachGridContainerOnly) {
			return;
		}

		//Track the control key, used to open SeeDetails in new tab
		window.addEventListener(
			"keydown",
			(event) => {
				if (event.key === "Control") {
					this._ctrlPress = true;
				}
			},
			true
		);

		window.addEventListener(
			"keyup",
			(event) => {
				if (event.key === "Control") {
					this._ctrlPress = false;
				}
			},
			true
		);

		// Add the fix toolbar with the pause button if we scroll past the original pause button
		const scrollToTopBtn = document.getElementById("scrollToTop-fixed");
		const originalPauseBtn = document.getElementById("pauseFeed");
		const fixedPauseBtn = document.getElementById("pauseFeed-fixed");
		const originalBtnPosition = originalPauseBtn.getBoundingClientRect().top + window.scrollY;

		// Handle scroll
		window.addEventListener("scroll", () => {
			if (window.scrollY > originalBtnPosition) {
				document.getElementById("fixed-toolbar").style.display = "block";
			} else {
				document.getElementById("fixed-toolbar").style.display = "none";
			}
		});

		scrollToTopBtn.addEventListener("click", () => {
			window.scrollTo({
				top: 0,
				behavior: "smooth",
			});
		});

		fixedPauseBtn.addEventListener("click", () => {
			originalPauseBtn.click();
		});

		// Search handler
		const searchInput = document.getElementById("search-input");
		if (searchInput) {
			searchInput.addEventListener("input", (event) => {
				if (this._searchDebounceTimer) {
					clearTimeout(this._searchDebounceTimer);
				}
				this._searchDebounceTimer = setTimeout(() => {
					this._searchText = event.target.value;
					// Apply search filter to all items
					document.querySelectorAll(".vvp-item-tile").forEach((node) => {
						this.#processNotificationFiltering(node);
					});
					this._updateTabTitle();
				}, 750); // 300ms debounce delay
			});
		}

		//Bind clear-monitor button
		const btnClearMonitor = document.getElementById("clear-monitor");
		btnClearMonitor.addEventListener("click", async (event) => {
			//Delete all items from the grid
			if (confirm("Clear all visible items?")) {
				this._preserveScrollPosition(() => {
					this.#clearAllVisibleItems();
				});
				this._updateTabTitle();
			}
		});

		//Bind clear-unavailable button
		const btnClearUnavailable = document.getElementById("clear-unavailable");
		btnClearUnavailable.addEventListener("click", async (event) => {
			if (confirm("Clear unavailable items?")) {
				this.#clearUnavailableItems();
				this._updateTabTitle();
			}
		});

		//Bind fetch-last-100 button
		const btnLast100 = document.getElementById("fetch-last-100");
		btnLast100.addEventListener("click", async (event) => {
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
				document.getElementById("pauseFeed").click();
			}

			chrome.runtime.sendMessage({
				type: "fetchLatestItems",
				limit: this._fetchLimit,
			});
		});

		//Bind fetch-last-12hrs button
		const btnLast12hrs = document.getElementById("fetch-last-12hrs");
		if (btnLast12hrs) {
			btnLast12hrs.addEventListener("click", async (event) => {
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
					document.getElementById("pauseFeed").click();
				}

				chrome.runtime.sendMessage({
					type: "fetchLatestItems",
					limit: "12hrs",
				});
			});
		}

		//Bind Pause Feed button
		const btnPauseFeed = document.getElementById("pauseFeed");
		btnPauseFeed.addEventListener("click", (event) => {
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
				document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
					if (node.dataset.feedPaused == "true") {
						node.dataset.feedPaused = "false";
						this.#processNotificationFiltering(node);
					}
				});
				this._updateTabTitle();
			}
		});

		// Bind sort and filter controls
		const sortQueue = document.querySelector("select[name='sort-queue']");
		sortQueue.addEventListener("change", async (event) => {
			this._sortType = sortQueue.value;
			await this._settings.set("notification.monitor.sortType", this._sortType);
			this.#processNotificationSorting();
			// Force immediate truncate when sort type changes
			this.#autoTruncate(true);
		});

		const filterType = document.querySelector("select[name='filter-type']");
		filterType.addEventListener("change", (event) => {
			this._filterType = filterType.value;
			this._settings.set("notification.monitor.filterType", this._filterType);
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this._updateTabTitle();
		});

		const filterQueue = document.querySelector("select[name='filter-queue']");
		filterQueue.addEventListener("change", (event) => {
			this._filterQueue = filterQueue.value;
			this._settings.set("notification.monitor.filterQueue", this._filterQueue);
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this._updateTabTitle();
		});

		const autoTruncateCheckbox = document.getElementById("auto-truncate");
		autoTruncateCheckbox.checked = this._autoTruncateEnabled;
		autoTruncateCheckbox.addEventListener("change", (event) => {
			this._autoTruncateEnabled = autoTruncateCheckbox.checked;
			this._settings.set("notification.monitor.autoTruncate", this._autoTruncateEnabled);
			// Force immediate truncate when auto truncate is enabled
			if (this._autoTruncateEnabled) {
				this.#autoTruncate(true);
			}
		});

		const autoTruncateLimitSelect = document.getElementById("auto-truncate-limit");
		autoTruncateLimitSelect.addEventListener("change", (event) => {
			this._settings.set("notification.monitor.autoTruncateLimit", parseInt(autoTruncateLimitSelect.value));
			// Force immediate truncate when limit changes
			this.#autoTruncate(true);
		});
	}
}

export { NotificationMonitor };
