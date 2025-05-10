
import { getRecommendationTypeFromQueue, generateRecommendationString } from "../Grid.js";
import { YMDHiStoISODate } from "../DateHelper.js";
import { keywordMatch } from "../service_worker/keywordMatch.js";
import { unescapeHTML, removeSpecialHTML } from "../StringHelper.js";
import { MonitorCore } from "./MonitorCore.js";

//const TYPE_SHOW_ALL = -1;
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;
const TYPE_HIGHLIGHT_OR_ZEROETV = 9;

const TYPE_DATE = "date";
const TYPE_PRICE = "price";

class NotificationMonitor extends MonitorCore {
	_feedPaused = false;
	_feedPausedAmountStored = 0;
	_fetchingRecentItems;
	_waitTimer; //Timer which wait a short delay to see if anything new is about to happen
	_imageUrls = new Set(); // Set of image URLs used for duplicate thumbnail detection (kept separate for O(1) lookup performance)
	_items = new Map(); // Combined map to store both item data and DOM elements
	_gridContainer = null;
	_wsErrorMessage = null;
	_firefox = false;
	_mostRecentItemDate = null;
	_mostRecentItemDateDOM = null;
	_itemTemplateFile = "tile_gridview.html";
	_fetchLimit = 100;
	_searchText = ""; // Current search text
	_searchDebounceTimer = null; // Timer for debouncing search
	_autoTruncateDebounceTimer = null; // Timer for debouncing autoTruncate
	_ctrlPress = false;
	// UI User settings (will be loaded from storage)
	_autoTruncateEnabled = true;
	_filterQueue = -1;
	_filterType = -1;
	_sortType = TYPE_DATE;

	async #initialize() {
		this._fetchLimit = await this._getFetchLimit(); //MonitorLib
	}

	constructor() {
		super();

		// Prevent direct instantiation of the abstract class
		if (this.constructor === NotificationMonitor) {
			throw new TypeError('Abstract class "NotificationMonitor" cannot be instantiated directly.');
		}

		this.#initialize();
	}

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
		if (this._monitorV3 && !this._tierMgr.isGold() && this._settings.get("notification.monitor.hideGoldNotificationsForSilverUser")) {
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

	#disableGoldItemsForSilverUsers(notif, updateTier = false) {
		if (!notif) {
			return;
		}

		if (this._monitorV3 && !this._tierMgr.isGold() && notif.dataset.tier !== "silver") {
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

	#sortItems() {
		// Only proceed if there are items to sort
		if (this._items.size === 0) return;

		// Convert Map to array for sorting
		const itemsArray = Array.from(this._items.entries()).map(([asin, item]) => {
			return {
				asin,
				data: item.data,
				element: item.element,
			};
		});

		// Sort based on the current sort type
		itemsArray.sort((a, b) => {
			if (this._sortType === TYPE_DATE) {
				// Sort by date, newest first
				return b.data.date - a.data.date;
			} else {
				// Default: sort by price (TYPE_PRICE), highest first
				// Treat null/undefined as -1 so actual 0 values rank higher
				const aPrice =
					a.data.etv_min !== null && a.data.etv_min !== undefined ? parseFloat(a.data.etv_min) : -1;
				const bPrice =
					b.data.etv_min !== null && b.data.etv_min !== undefined ? parseFloat(b.data.etv_min) : -1;
				return bPrice - aPrice;
			}
		});

		// Transform the sorted array back to [key, value] pairs for the Map constructor
		this._items = new Map(
			itemsArray.map((item) => [
				item.asin,
				{
					data: item.data,
					element: item.element,
				},
			])
		);

		return itemsArray;
	}

	// Get DOM element for an item
	getItemDOMElement(asin) {
		return this._items.get(asin)?.element;
	}

	async markItemUnavailable(asin) {
		// Update the item data first
		if (this._items.has(asin)) {
			const item = this._items.get(asin);
			item.data.unavailable = true;
			this._items.set(asin, item);
		}

		// Then update the DOM
		const notif = this.getItemDOMElement(asin);
		this._disableItem(notif);
	}

	fetchRecentItemsEnd() {
		if (this._feedPaused) {
			//Unbuffer the feed
			document.getElementById("pauseFeed").click();
		}
		this._fetchingRecentItems = false;

		this.#processNotificationSorting();
		this._updateTabTitle();
	}

	// Update item data with ETV
	#updateItemETV(asin, etv) {
		if (!this._items.has(asin)) {
			return false;
		}

		const item = this._items.get(asin);

		// Update min and max ETV values
		if (!item.data.etv_min || etv < item.data.etv_min) {
			item.data.etv_min = etv;
		}

		if (!item.data.etv_max || etv > item.data.etv_max) {
			item.data.etv_max = etv;
		}

		// Update the Map
		this._items.set(asin, item);
		// Sort the items after adding or updating a new item
		this.#sortItems();

		return true;
	}

	#updateItemTier(asin, tier) {
		if (!this._items.has(asin)) {
			return false;
		}

		const item = this._items.get(asin);
		item.data.tier = tier;
		this._items.set(asin, item);
		this.#sortItems();

		return true;
	}

	#bulkRemoveItems(asinsToKeep, isKeepSet = false) {
		this._preserveScrollPosition(() => {
			// Always use the optimized container replacement approach
			// Create a new empty container
			const newContainer = this._gridContainer.cloneNode(false);

			// Create a new items map to store the updated collection
			const newItems = new Map();
			const newImageUrls = new Set();

			// Efficiently process all items
			this._items.forEach((item, asin) => {
				const shouldKeep = isKeepSet ? asinsToKeep.has(asin) : !asinsToKeep.has(asin);

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
			this._createListeners(true);

			// Update the data structures
			this._items = newItems;
			this._imageUrls = newImageUrls;
		});

		// Update the tab counter
		this._updateTabTitle();
	}

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
				if (this._items.size > max) {
					Log.add(`NOTIF: Auto truncating item(s) from the page using the ${this._sortType} sort method.`);

					// Convert map to array for sorting
					const itemsArray = Array.from(this._items.entries()).map(([asin, item]) => ({
						asin,
						date: new Date(item.data.date),
						price: parseFloat(item.data.etv_min) || 0,
						element: item.element,
					}));

					// Sort according to current sort method, but reversed
					// (we want to remove lowest price or oldest items)
					if (this._sortType === TYPE_PRICE) {
						itemsArray.sort((a, b) => a.price - b.price); // Sort lowest price first
					} else {
						itemsArray.sort((a, b) => a.date - b.date); // Sort oldest first (default)
					}

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

	// Method for efficient bulk item removal or retention using container replacement

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

	// Clear unavailable items
	#clearUnavailableItems() {
		// Get all unavailable ASINs
		const unavailableAsins = new Set();
		this._items.forEach((item, asin) => {
			if (item.data.unavailable) {
				unavailableAsins.add(asin);
			}
		});

		// Use the bulk remove method, letting it decide the optimal approach
		this.#bulkRemoveItems(unavailableAsins, false);
	}

	async addTileInGrid(itemData) {
		if (!itemData) {
			return false;
		}

		itemData.unavailable = itemData.unavailable == 1;
		itemData.typeHighlight = itemData.KWsMatch ? 1 : 0;
		itemData.typeZeroETV = itemData.etv_min !== null && parseFloat(itemData.etv_min) === 0 ? 1 : 0;
		itemData.title = unescapeHTML(unescapeHTML(itemData.title));
		itemData.date = new Date(YMDHiStoISODate(itemData.date)); //Convert server date time to local date time
		const {
			asin,
			queue,
			tier,
			date,
			title,
			img_url,
			is_parent_asin,
			enrollment_guid,
			etv_min,
			etv_max,
			reason,
			highlightKW,
			KWsMatch,
			blurKW,
			BlurKWsMatch,
			unavailable,
		} = itemData;

		const recommendationType = getRecommendationTypeFromQueue(queue); //grid.js
		const recommendationId = generateRecommendationString(recommendationType, asin, enrollment_guid); //grid.js

		// If the notification already exists, update the data and return the existing DOM element
		if (this._items.has(asin)) {
			const element = this.getItemDOMElement(asin);
			if (element) {
				Log.add(`NOTIF: Item ${asin} already exists, updating RecommendationId.`);
				// Update the data
				this.#addItemData(asin, itemData);

				// Update recommendationId in the DOM
				// it's possible that the input element was removed as part of the de-duplicate image process or the gold tier check
				element.dataset.recommendationId = recommendationId;
				const inputElement = element.querySelector(`input[data-asin='${asin}']`);
				if (inputElement) {
					inputElement.dataset.recommendationId = recommendationId;
				}

				if (!itemData.unavailable) {
					this._enableItem(element);
				}
				return element;
			}
		}

		// Check if the de-duplicate image setting is on
		if (this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			if (this._imageUrls.has(img_url)) {
				return false; // The image already exists, do not add the item
			}
		}

		// Store the item data
		this.#addItemData(asin, itemData);

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
		this._tpl.setVar("dateReceived", this._formatDate(this._currentDateTime()));
		this._tpl.setVar("date", this._formatDate(date));
		this._tpl.setVar("feedPaused", this._feedPaused);
		this._tpl.setVar("queue", queue);
		this._tpl.setVar("description", title);
		this._tpl.setVar("reason", reason);
		this._tpl.setVar("highlightKW", highlightKW);
		this._tpl.setVar("blurKW", blurKW);
		this._tpl.setVar("is_parent_asin", is_parent_asin); //"true" or "false"
		this._tpl.setVar("enrollment_guid", enrollment_guid);
		this._tpl.setVar("recommendationType", recommendationType);
		this._tpl.setVar("recommendationId", recommendationId);
		this._tpl.setVar("search_url", search_url);
		this._tpl.setIf("announce", this._settings.get("discord.active") && this._settings.get("discord.guid", false) != null);
		this._tpl.setIf("pinned", this._settings.get("pinnedTab.active"));
		this._tpl.setIf("variant", this._settings.isPremiumUser() && this._settings.get("general.displayVariantIcon") && is_parent_asin);

		let tileDOM = await this._tpl.render(prom2, true);

		// Create fragment and add the tile to it
		const fragment = document.createDocumentFragment();
		fragment.appendChild(tileDOM);

		this._preserveScrollPosition(() => {
			// Insert the tile based on sort type
			if (this._sortType === TYPE_PRICE) {
				if (etv_min !== null) {
					// For price sorting, find the correct position and insert there
					const newPrice = parseFloat(etv_min) || 0;
					let insertPosition = null;

					// Find the first item with a lower price
					const existingItems = Array.from(this._items.entries());
					for (const [existingAsin, item] of existingItems) {
						// Skip the current item or items without elements
						if (existingAsin === asin || !item.element) continue;

						const existingPrice = parseFloat(item.data.etv_min) || 0;
						if (newPrice > existingPrice) {
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
			} else {
				// For other sort types, just insert at the beginning
				this._gridContainer.insertBefore(fragment, this._gridContainer.firstChild);
			}
		});

		// Store a reference to the DOM element
		this.#storeItemDOMElement(asin, tileDOM);

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
			if (parseFloat(etv_min) === 0) {
				this.#zeroETVItemFound(tileDOM, false); //Ok now process 0etv, but no sound
			}
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

	#clickHandler(e) {
		// If a user clicks on the link wrapper around an icon, it would navigate to the
		// default href (which is usually #) which breaks several things. We'll fix this by
		// matching the parent link elements and prevent default there (bubbling events)

		// Helper function to handle icon clicks and their parent links
		const _handleIconClick = (iconSelector, handler) => {
			const icon = e.target.closest(iconSelector);
			if (icon) {
				e.preventDefault();
				handler(icon, e);
				return true;
			}

			// Check if clicked on a parent link containing this icon type
			const parentLink = e.target.closest(`a:has(${iconSelector})`);
			if (parentLink && !e.target.closest(iconSelector)) {
				e.preventDefault();
				// Find the actual icon and handle it
				const containedIcon = parentLink.querySelector(iconSelector);
				if (containedIcon) {
					handler(containedIcon, e);
					return true;
				}
			}

			return false;
		};

		// Handle search icon
		if (
			_handleIconClick(".vh-icon-search", (icon) => {
				window.open(icon.closest("a").href, "_blank");
			})
		)
			return;

		// Handle report icon
		if (
			_handleIconClick(".vh-icon-report", () => {
				this._handleReportClick(e);
			})
		)
			return;

		// Handle announcement icon
		if (
			_handleIconClick(".vh-icon-announcement", () => {
				if (this._settings.get("discord.active") && this._settings.get("discord.guid", false) != null) {
					this.#handleBrendaClick(e);
				}
			})
		)
			return;

		// Handle pin icon
		if (
			_handleIconClick(".vh-icon-pin, .vh-icon-unpin", () => {
				if (this._settings.get("pinnedTab.active")) {
					this.#handlePinClick(e);
				}
			})
		)
			return;

		// Handle hide icon
		if (
			_handleIconClick(".vh-icon-hide", () => {
				this.#handleHideClick(e);
			})
		)
			return;

		// Handle details icon
		if (
			_handleIconClick(".vh-icon-question", () => {
				this.#handleDetailsClick(e);
			})
		)
			return;

		//Add the click listener for the See Details button
		if (this._firefox || this._settings.get("notification.monitor.openLinksInNewTab") == "1" || this._ctrlPress) {
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

	// Add or update item data in the Map
	#addItemData(asin, itemData) {
		// Create a new item object or update existing one

		if (!this._items.has(asin)) {
			// New item
			this._items.set(asin, {
				data: {
					...itemData,
					dateAdded: this._currentDateTime(),
				},
				element: null, // Element will be set later
			});
		} else {
			// Update existing item data, preserving the element reference
			const existing = this._items.get(asin);
			this._items.set(asin, {
				data: {
					...existing.data,
					...itemData,
				},
				element: existing.element,
			});
		}

		// Store image URL if needed for duplicate detection
		if (itemData.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this._imageUrls.add(itemData.img_url);
		}

		// Sort the items after adding or updating a new item
		this.#sortItems();
	}

	// Store DOM element reference
	#storeItemDOMElement(asin, element) {
		if (this._items.has(asin)) {
			const item = this._items.get(asin);
			item.element = element;
			this._items.set(asin, item);
		} else {
			// Should not happen, but handle the case
			this._items.set(asin, {
				data: {
					asin: asin,
					dateAdded: this._currentDateTime(),
				},
				element: element,
			});
		}
	}

	// Remove item completely
	#removeTile(tile, asin, countTotalTiles = true) {
		if (!tile || !asin) {
			return;
		}

		// Get the item data to access its image URL
		const item = this._items.get(asin);
		const imgUrl = item?.data?.img_url;

		// Remove the tooltip
		const a = tile.querySelector(".a-link-normal");
		if (a) {
			this._tooltipMgr.removeTooltip(a);
		}

		// Remove from data structures
		this._items.delete(asin);

		// Also remove the image URL from the set if duplicate detection is enabled
		if (imgUrl && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this._imageUrls.delete(imgUrl);
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
					this.#highlightedItemFound(notif, this._settings.get("notification.monitor.highlight.sound") != "0");
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
						Log.add(`NOTIF: Item ${asin} matched hide keyword ${val2}. Hidding it.`);
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
	}

	async setTierFromASIN(asin, tier) {
		if (!this._items.has(asin)) {
			return false;
		}

		if (!this.#updateItemTier(asin, tier)) {
			return false;
		}

		// Get the corresponding DOM element
		const notif = this.getItemDOMElement(asin);
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
	async setETVFromASIN(asin, etv) {
		// Store old ETV value to detect if reordering is needed
		const oldETV = this._items.get(asin)?.data?.etv_min || 0;

		// Update the data in our Map
		if (!this.#updateItemETV(asin, etv)) {
			return false;
		}

		// Get the corresponding DOM element
		const notif = this.getItemDOMElement(asin);
		if (!notif) {
			return false;
		}

		// Update the DOM element
		this.#setETV(notif, etv);

		// Re-position the item if using price sort and the value changed significantly
		if (this._sortType === TYPE_PRICE) {
			const newETV = this._items.get(asin)?.data?.etv_min || 0;

			// Only reposition if the ETV changed significantly enough to potentially affect order
			if (Math.abs(newETV - oldETV) > 0.01) {
				// Remove the element from DOM
				notif.remove();

				// Find the correct position to insert
				const newPrice = parseFloat(newETV);
				let insertPosition = null;

				// Find the first item with a lower price
				for (const [existingAsin, item] of this._items.entries()) {
					// Skip the current item or items without elements
					if (existingAsin === asin || !item.element || !item.element.parentNode) continue;

					const existingPrice = parseFloat(item.data.etv_min) || 0;
					if (newPrice > existingPrice) {
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
			}
		}

		return true;
	}

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
			if (this._sortType !== TYPE_PRICE && this._settings.get("notification.monitor.bump0ETV")) {
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
		if (!this._fetchingRecentItems) {
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

	#processNotificationSorting() {
		const container = document.getElementById("vvp-items-grid");

		this._preserveScrollPosition(() => {
			// Sort the items - reuse the sorting logic from #sortItems
			const sortedItems = this.#sortItems();

			// Only proceed if we have items
			if (!sortedItems || sortedItems.length === 0) return;

			// Filter out any items without DOM elements
			const validItems = sortedItems.filter((item) => item.element);

			// Efficiently reorder DOM elements
			// Remove all items from the DOM first to avoid unnecessary reflows
			validItems.forEach((item) => {
				// We use a trick here - detach the element but keep the reference
				if (item.element.parentNode) {
					item.element.remove();
				}
			});

			// Then re-append them in the correct order
			validItems.forEach((item) => {
				container.appendChild(item.element);
			});
		});
	}

	//############################################################
	//## CLICK HANDLERS

	#handleHideClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		Log.add(`NOTIF: Hiding icon clicked for item ${asin}`);

		// Get the DOM element from our Map
		const tile = this.getItemDOMElement(asin);
		if (tile) {
			this.#removeTile(tile, asin);
		}
	}

	#handleBrendaClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const queue = e.target.dataset.queue;

		let etv = document.querySelector("#vh-notification-" + asin + " .etv").dataset.etvMax;

		this._brendaMgr.announce(asin, etv, queue, this._i13nMgr.getDomainTLD());
	}

	async #handlePinClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const isPinned = await this._pinMgr.checkIfPinned(asin);
		const title = e.target.dataset.title;

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
			const isParentAsin = e.target.dataset.isParentAsin;
			const enrollmentGUID = e.target.dataset.enrollmentGuid;
			const queue = e.target.dataset.queue;
			const thumbnail = e.target.dataset.thumbnail;

			// Update the icon
			this._pinMgr.pinItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID);

			this._displayToasterNotification({
				title: `Item ${asin} pinned.`,
				lifespan: 3,
				content: title,
			});
		}
	}

	#handleDetailsClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const date = e.target.dataset.date;
		const dateReceived = e.target.dataset.dateReceived;
		const tier = e.target.dataset.tier;
		const reason = e.target.dataset.reason;
		const highlightKW = e.target.dataset.highlightkw;
		const blurKW = e.target.dataset.blurkw;
		const queue = e.target.dataset.queue;

		let m = this._dialogMgr.newModal("item-details-" + asin);
		m.title = "Item " + asin;
		m.content = `
			<ul style="margin-bottom: 10px;">
				<li>Broadcast date/time: ${date}</li>
				<li>Received date/time: ${dateReceived}</li>
				<li>Broadcast reason: ${reason}</li>
				<li>Queue: ${queue}</li>
				<li>Found in tier: ${tier}</li>
				<li>Highlight Keyword: ${highlightKW}</li>
				<li>Blur Keyword: ${blurKW}</li>
			</ul>
		`;
		m.show();
	}

	//#######################################################

	_createListeners(reattachGridContainerOnly = false) {
		// Bind the click handler to the instance and then add as event listener
		this._gridContainer.addEventListener("click", (e) => this.#clickHandler(e));

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

			// Start 60 second countdown
			let secondsLeft = 60;
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

		//Bind Pause Feed button
		const btnPauseFeed = document.getElementById("pauseFeed");
		btnPauseFeed.addEventListener("click", (event) => {
			this._feedPaused = !this._feedPaused;
			if (this._feedPaused) {
				this._feedPausedAmountStored = 0;
				document.getElementById("pauseFeed").value = "Resume Feed (0)";
				document.getElementById("pauseFeed-fixed").value = "Resume Feed (0)";
			} else {
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
		sortQueue.addEventListener("change", (event) => {
			this._sortType = sortQueue.value;
			this._settings.set("notification.monitor.sortType", this._sortType);
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
