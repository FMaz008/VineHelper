import { Logger } from "./Logger.js";
var logger = new Logger();
import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();
import { Internationalization } from "./Internationalization.js";
const i13n = new Internationalization();
import { Environment } from "./Environment.js";
var env = new Environment();
import { Template } from "./Template.js";
var Tpl = new Template();
import { getRecommendationTypeFromQueue, generateRecommendationString } from "./Grid.js";
import { YMDHiStoISODate } from "./DateHelper.js";
import { keywordMatch } from "./service_worker/keywordMatch.js";
import { NotificationsSoundPlayer } from "./NotificationsSoundPlayer.js";
const SoundPlayer = new NotificationsSoundPlayer();
import { PinnedListMgr } from "./PinnedListMgr.js";
var PinnedList = new PinnedListMgr();
import { ScreenNotifier, ScreenNotification } from "./ScreenNotifier.js";
var Notifications = new ScreenNotifier();
import { unescapeHTML, removeSpecialHTML } from "./StringHelper.js";
import { Tooltip } from "./Tooltip.js";
var tooltip = new Tooltip();
import { BrendaAnnounceQueue } from "./BrendaAnnounce.js";
var brendaAnnounceQueue = new BrendaAnnounceQueue();
import { ModalMgr } from "./ModalMgr.js";
var DialogMgr = new ModalMgr();

//const TYPE_SHOW_ALL = -1;
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;
const TYPE_HIGHLIGHT_OR_ZEROETV = 9;

const TYPE_DATE = "date";
const TYPE_PRICE = "price";

class NotificationMonitor {
	_feedPaused = false;
	_feedPausedAmountStored;
	_fetchingRecentItems;
	_serviceWorkerStatusTimer;
	_waitTimer; //Timer which wait a short delay to see if anything new is about to happen
	_imageUrls; // Set of image URLs used for duplicate thumbnail detection (kept separate for O(1) lookup performance)
	_items; // Combined map to store both item data and DOM elements
	_gridContainer = null;
	_wsErrorMessage = null;
	_firefox = false;
	_mostRecentItemDate = null;
	_mostRecentItemDateDOM = null;
	_goldTier = true;
	_etvLimit = null;
	_itemTemplateFile = "tile_gridview.html";
	_lightMode = false;
	_statusTimer = null;
	_fetchLimit = 100;
	_searchText = ""; // Current search text
	_searchDebounceTimer = null; // Timer for debouncing search
	_tileSizer = null;
	_autoTruncateDebounceTimer = null; // Timer for debouncing autoTruncate
	_ctrlPress = false;
	// UI User settings (will be loaded from storage)
	_autoTruncateEnabled = true;
	_filterQueue = -1;
	_filterType = -1;
	_sortType = TYPE_DATE;

	async #defineFetchLimit() {
		await Settings.waitForLoad();

		//Define the fetch limit based on the user's tier
		if (Settings.isPremiumUser(3)) {
			this._fetchLimit = 300;
		} else if (Settings.isPremiumUser(2)) {
			this._fetchLimit = 200;
		} else {
			this._fetchLimit = 100;
		}
	}

	constructor() {
		// Prevent direct instantiation of the abstract class
		if (this.constructor === NotificationMonitor) {
			throw new TypeError('Abstract class "NotificationMonitor" cannot be instantiated directly.');
		}

		this._imageUrls = new Set();
		this._items = new Map(); // Initialize the combined map to store all item data and DOM elements
		this._feedPausedAmountStored = 0;

		this.#defineFetchLimit();
	}

	async _loadUIUserSettings() {
		// Load settings from chrome.storage.local
		await Settings.waitForLoad();

		//Get the filter and sorting settings
		this._autoTruncateEnabled = Settings.get("notification.monitor.autoTruncate");
		this._filterQueue = Settings.get("notification.monitor.filterQueue");
		this._filterType = Settings.get("notification.monitor.filterType");
		this._sortType = Settings.get("notification.monitor.sortType");

		// Update UI
		const autoTruncateCheckbox = document.getElementById("auto-truncate");
		if (autoTruncateCheckbox) autoTruncateCheckbox.checked = this._autoTruncateEnabled;

		const autoTruncateLimit = document.getElementById("auto-truncate-limit");
		if (autoTruncateLimit)
			autoTruncateLimit.value = Settings.get("notification.monitor.autoTruncateLimit").toString();

		const filterQueueSelect = document.querySelector("select[name='filter-queue']");
		if (filterQueueSelect) filterQueueSelect.value = this._filterQueue;

		const filterTypeSelect = document.querySelector("select[name='filter-type']");
		if (filterTypeSelect) filterTypeSelect.value = this._filterType;

		const sortQueueSelect = document.querySelector("select[name='sort-queue']");
		if (sortQueueSelect) sortQueueSelect.value = this._sortType;
	}

	// Check if an item is already pinned
	async #checkIfPinned(asin) {
		await PinnedList.getList(); // This will wait for the list to be loaded
		return PinnedList.isPinned(asin);
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
		if (!this._goldTier && Settings.get("notification.monitor.hideGoldNotificationsForSilverUser")) {
			const etvObj = node.querySelector("div.etv");
			if (etvObj && this._etvLimit != null && parseFloat(etvObj.dataset.etvMin) > this._etvLimit) {
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
			node.style.display = this._lightMode ? "block" : "flex";
		} else if (this._filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
			node.style.display =
				notificationTypeZeroETV || notificationTypeHighlight ? (this._lightMode ? "block" : "flex") : "none";
		} else if (this._filterType == TYPE_HIGHLIGHT) {
			node.style.display = notificationTypeHighlight ? (this._lightMode ? "block" : "flex") : "none";
		} else if (this._filterType == TYPE_ZEROETV) {
			node.style.display = notificationTypeZeroETV ? (this._lightMode ? "block" : "flex") : "none";
		} else if (this._filterType == TYPE_REGULAR) {
			node.style.display =
				!notificationTypeZeroETV && !notificationTypeHighlight ? (this._lightMode ? "block" : "flex") : "none";
		}

		//Queue filter
		if (node.style.display == "flex" || node.style.display == "block") {
			if (this._filterQueue == "-1") {
				return true;
			} else {
				node.style.display = queueType == this._filterQueue ? (this._lightMode ? "block" : "flex") : "none";
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

		if (!this._goldTier && notif.dataset.tier !== "silver") {
			const etvObj = notif.querySelector("div.etv");

			if (this._etvLimit != null && parseFloat(etvObj.dataset.etvMin) > this._etvLimit) {
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
				if (Settings.get("notification.monitor.hideGoldNotificationsForSilverUser")) {
					this.#processNotificationFiltering(notif);
				}
			}
		}
	}

	// Helper method to preserve scroll position during DOM operations
	#preserveScrollPosition(callback) {
		// Save current scroll position
		const scrollPosition = window.scrollY;

		// Execute the DOM operation
		callback();

		// Restore scroll position
		window.scrollTo({
			top: scrollPosition,
			behavior: "auto", // Use "auto" instead of "smooth" to prevent visible jumping
		});
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
	#getItemDOMElement(asin) {
		return this._items.get(asin)?.element;
	}

	// Check if an item exists
	#hasItem(asin) {
		return this._items.has(asin);
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

	#bulkRemoveItems(asinsToKeep, isKeepSet = false) {
		this.#preserveScrollPosition(() => {
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
					if (item.data.img_url && Settings.get("notification.monitor.hideDuplicateThumbnail")) {
						newImageUrls.add(item.data.img_url);
					}
				}
			});

			// Replace the old container with the new one
			this._gridContainer.parentNode.replaceChild(newContainer, this._gridContainer);
			this._gridContainer = newContainer;

			// Reattach event listeners to the new container
			this._createEventListeners();

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
				const max = Settings.get("notification.monitor.autoTruncateLimit");
				// Check if we need to truncate based on map size
				if (this._items.size > max) {
					logger.add(`NOTIF: Auto truncating item(s) from the page using the ${this._sortType} sort method.`);

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
		this.#preserveScrollPosition(() => {
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

	_updateTabFavicon() {
		const favicon = document.querySelector("link[rel~='icon']");
		if (favicon) {
			favicon.href = "https://vinehelper.ovh/favicon.ico";
		} else {
			const link = document.createElement("link");
			link.rel = "icon"; // Specify the relationship type
			link.href = "https://vinehelper.ovh/favicon.ico";
			document.head.appendChild(link);
		}
	}

	_hideSelector(selector) {
		try {
			document.querySelectorAll(selector).forEach((elem) => {
				elem.style.display = "none";
			});
		} catch (err) {
			//Do nothing
		}
	}

	_updateGoldStatus() {
		this._goldTier = env.getTierLevel("gold") === "gold";
		logger.add("NOTIF: Gold tier: " + this._goldTier);

		if (!this._goldTier) {
			//Get the maximum allowed value
			this._etvLimit = env.getSilverTierLimit();
			logger.add("NOTIF: ETV limit: " + this._etvLimit);
		}
	}

	async #enableItem(notif) {
		if (!notif) {
			return false;
		}
		notif.style.opacity = "1";
		notif.style.filter = "brightness(1)";
		notif.querySelector(".unavailable-banner")?.remove();
	}

	async #disableItem(notif) {
		if (!notif) {
			return false;
		}

		//Remove the banner if it already existed
		notif.querySelector(".unavailable-banner")?.remove();

		//Add a new banner
		const banner = document.createElement("div");
		banner.classList.add("unavailable-banner");
		banner.innerText = "Unavailable";
		banner.style.isolation = "isolate"; // This prevents the banner from inheriting the filter effects
		const imgContainer = notif.querySelector(".vh-img-container");
		imgContainer.insertBefore(banner, imgContainer.firstChild);

		notif.style.opacity = "0.5";
		notif.style.filter = "brightness(0.7)";
	}

	async addTileInGrid(
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
		unavailable
	) {
		if (!asin) {
			return false;
		}

		title = unescapeHTML(unescapeHTML(title));

		const recommendationType = getRecommendationTypeFromQueue(queue); //grid.js
		const recommendationId = generateRecommendationString(recommendationType, asin, enrollment_guid); //grid.js

		//Convert server date time to local date time
		date = new Date(YMDHiStoISODate(date));
		// Create the item data object
		const itemData = {
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
			unavailable: unavailable == 1,
			recommendationType,
			recommendationId,
			typeHighlight: KWsMatch ? 1 : 0,
			typeZeroETV: etv_min !== null && parseFloat(etv_min) === 0 ? 1 : 0,
		};

		// If the notification already exists, update the data and return the existing DOM element
		if (this.#hasItem(asin)) {
			const element = this.#getItemDOMElement(asin);
			if (element) {
				logger.add(`NOTIF: Item ${asin} already exists, updating RecommendationId.`);
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
					this.#enableItem(element);
				}
				return element;
			}
		}

		// Check if the de-duplicate image setting is on
		if (Settings.get("notification.monitor.hideDuplicateThumbnail")) {
			if (this._imageUrls.has(img_url)) {
				return false; // The image already exists, do not add the item
			}
		}

		// Store the item data
		this.#addItemData(asin, itemData);

		// Generate the search URL
		let search_url;
		if (
			Settings.isPremiumUser(2) &&
			Settings.get("general.searchOpenModal") &&
			is_parent_asin != null &&
			enrollment_guid != null
		) {
			search_url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`;
		} else {
			let truncatedTitle = title.length > 40 ? title.substr(0, 40).split(" ").slice(0, -1).join(" ") : title;
			truncatedTitle = removeSpecialHTML(truncatedTitle);
			const search_url_slug = encodeURIComponent(truncatedTitle);
			search_url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search_url_slug}`;
		}

		let prom2 = await Tpl.loadFile("view/" + this._itemTemplateFile);
		Tpl.setVar("id", asin);
		Tpl.setVar("domain", i13n.getDomainTLD());
		Tpl.setVar("img_url", img_url);
		Tpl.setVar("asin", asin);
		Tpl.setVar("tier", tier);
		Tpl.setVar("dateReceived", this._formatDate(this._currentDateTime()));
		Tpl.setVar("date", this._formatDate(date));
		Tpl.setVar("feedPaused", this._feedPaused);
		Tpl.setVar("queue", queue);
		Tpl.setVar("description", title);
		Tpl.setVar("reason", reason);
		Tpl.setVar("highlightKW", highlightKW);
		Tpl.setVar("blurKW", blurKW);
		Tpl.setVar("is_parent_asin", is_parent_asin);
		Tpl.setVar("enrollment_guid", enrollment_guid);
		Tpl.setVar("recommendationType", recommendationType);
		Tpl.setVar("recommendationId", recommendationId);
		Tpl.setVar("search_url", search_url);
		Tpl.setIf("announce", Settings.get("discord.active") && Settings.get("discord.guid", false) != null);
		Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
		Tpl.setIf("variant", Settings.isPremiumUser() && Settings.get("general.displayVariantIcon") && is_parent_asin);

		let tileDOM = await Tpl.render(prom2, true);

		// Create fragment and add the tile to it
		const fragment = document.createDocumentFragment();
		fragment.appendChild(tileDOM);

		// Check if the item is already pinned and update the pin icon
		if (Settings.get("pinnedTab.active")) {
			const isPinned = await this.#checkIfPinned(asin);
			if (isPinned) {
				const pinIcon = tileDOM.querySelector(".vh-icon-pin");
				if (pinIcon) {
					pinIcon.classList.add("vh-icon-pin-active");
					pinIcon.title = "Click to unpin this item";
				}
			}
		}

		this.#preserveScrollPosition(() => {
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

		//Set the tile custom dimension according to the settings.
		if (!this._lightMode && !Settings.get("notification.monitor.listView")) {
			this._tileSizer.adjustAll(tileDOM);
		}
		//Add tool tip to the truncated item title link
		if (!this._lightMode && Settings.get("general.displayFullTitleTooltip")) {
			const titleDOM = tileDOM.querySelector(".a-link-normal");
			tooltip.addTooltip(titleDOM, title);
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
			this.#blurItemFound(tileDOM);
		}

		//If we received ETV data (ie: Fetch last 100), process them
		if (etv_min != null && etv_max != null) {
			//Set the ETV but take no action on it
			this.setETV(tileDOM, etv_min);
			this.setETV(tileDOM, etv_max);

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
			this.#disableItem(tileDOM);
		}

		//Set the highlight color as needed
		this.#processNotificationHighlight(tileDOM);

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

	_createEventListeners() {
		// Bind the click handler to the instance and then add as event listener
		this._gridContainer.addEventListener("click", (e) => this.#clickHandler(e));

		// Add key event listeners with more robust handling
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
				this.#handleReportClick(e);
			})
		)
			return;

		// Handle announcement icon
		if (
			_handleIconClick(".vh-icon-announcement", () => {
				if (Settings.get("discord.active") && Settings.get("discord.guid", false) != null) {
					this.#handleBrendaClick(e);
				}
			})
		)
			return;

		// Handle pin icon
		if (
			_handleIconClick(".vh-icon-pin", () => {
				if (Settings.get("pinnedTab.active")) {
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
		if (this._firefox || Settings.get("notification.monitor.openLinksInNewTab") == "1" || this._ctrlPress) {
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
					`https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin};${enrollment_guid}`,
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

	_currentDateTime() {
		return new Date();
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
		if (itemData.img_url && Settings.get("notification.monitor.hideDuplicateThumbnail")) {
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
			tooltip.removeTooltip(a);
		}

		// Remove from data structures
		this._items.delete(asin);

		// Also remove the image URL from the set if duplicate detection is enabled
		if (imgUrl && Settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this._imageUrls.delete(imgUrl);
		}

		// Remove the element from DOM with scroll position preserved
		this.#preserveScrollPosition(() => {
			tile.remove();
		});
		tile = null;

		if (countTotalTiles) {
			this._updateTabTitle(); // Update the tab counter
		}
	}

	async setETV(notif, etv) {
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
			etvObj.style.display = this._lightMode ? "inline-block" : "block";
			if (etvObj.dataset.etvMin == etvObj.dataset.etvMax) {
				etvTxt.innerText = this.#formatETV(etvObj.dataset.etvMin);
			} else {
				etvTxt.innerText =
					this.#formatETV(etvObj.dataset.etvMin) + "-" + this.#formatETV(etvObj.dataset.etvMax);
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
					Settings.get("general.highlightKeywords"),
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
					this.#highlightedItemFound(notif, Settings.get("notification.monitor.highlight.sound") != "0");
				} else if (Settings.get("notification.hideList")) {
					//Check if we need to hide the item
					const val2 = await keywordMatch(
						Settings.get("general.hideKeywords"),
						title,
						etvObj.dataset.etvMin,
						etvObj.dataset.etvMax
					);
					if (val2 !== false) {
						//Remove (permanently "hide") the tile
						logger.add(`NOTIF: Item ${asin} matched hide keyword ${val2}. Hidding it.`);
						this.#removeTile(notif, asin);
					}
				}
			}
		}

		//zero ETV found, highlight the item accordingly
		if (oldMaxValue == "" && parseFloat(etvObj.dataset.etvMin) == 0) {
			this.#zeroETVItemFound(notif, Settings.get("notification.monitor.zeroETV.sound") != "0");
		}

		//Set the highlight color as needed
		this.#processNotificationHighlight(notif);

		this.#disableGoldItemsForSilverUsers(notif);
	}

	async #setETVFromASIN(asin, etv) {
		// Store old ETV value to detect if reordering is needed
		const oldETV = this._items.get(asin)?.data?.etv_min || 0;

		// Update the data in our Map
		if (!this.#updateItemETV(asin, etv)) {
			return false;
		}

		// Get the corresponding DOM element
		const notif = this.#getItemDOMElement(asin);
		if (!notif) {
			return false;
		}

		// Update the DOM element
		this.setETV(notif, etv);

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

	setWebSocketStatus(status, message = null) {
		const icon = document.querySelector("#statusWS div.vh-switch-32");
		const description = document.querySelector("#descriptionWS");
		if (status) {
			icon.classList.remove("vh-icon-switch-off");
			icon.classList.add("vh-icon-switch-on");
			description.innerText = "Listening for notifications...";
			this._wsErrorMessage = null;
		} else {
			icon.classList.remove("vh-icon-switch-on");
			icon.classList.add("vh-icon-switch-off");
			if (message) {
				this._wsErrorMessage = message;
				description.innerText = message;
			} else if (this._wsErrorMessage == null) {
				description.innerText = "Not connected. Retrying in 30 sec...";
			}
		}
	}

	_createServiceWorkerStatusTimer() {
		this._updateServiceWorkerStatus();
		this._serviceWorkerStatusTimer = window.setInterval(() => {
			this._updateServiceWorkerStatus();
		}, 10000);
	}

	_updateServiceWorkerStatus() {
		if (!Settings.get("notification.active")) {
			this.#setServiceWorkerStatus(
				false,
				"You need to enable the notifications in VineHelper's plugin settings, under the 'Notifications' tab."
			);
		} else if (i13n.getCountryCode() === null) {
			this._setServiceWorkerStatus(false, "Your country has not been detected, load a vine page first.");
		} else if (i13n.getDomainTLD() === null) {
			this._setServiceWorkerStatus(
				false,
				"No valid country found. You current country is detected as: '" +
					i13n.getCountryCode() +
					"', which is not currently supported by Vine Helper. Reach out so we can add it!"
			);
		} else if (Settings.get("notification.active")) {
			//Send a message to the service worker to check if it is still running
			this._statusTimer = window.setTimeout(() => {
				this.#setServiceWorkerStatus(false, "Not responding, reload the page.");
			}, 500);
			try {
				chrome.runtime.sendMessage({ type: "ping" });
			} catch (e) {
				//Page out of context, let the display show an error.
			}
		}
	}

	#setServiceWorkerStatus(status, desc = "") {
		const icon = document.querySelector("#statusSW div.vh-switch-32");
		const description = document.querySelector("#descriptionSW");

		if (status) {
			icon.classList.remove("vh-icon-switch-off");
			icon.classList.add("vh-icon-switch-on");
		} else {
			icon.classList.remove("vh-icon-switch-on");
			icon.classList.add("vh-icon-switch-off");
		}

		description.textContent = desc;
	}

	#zeroETVItemFound(notif, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		notif.dataset.typeZeroETV = 1;
		const tileVisible = this.#processNotificationFiltering(notif);

		//Play the zero ETV sound effect
		if ((tileVisible || this._fetchingRecentItems) && playSoundEffect) {
			SoundPlayer.play(TYPE_ZEROETV);
		}

		//Move the notification to the top only if we're not using price-based sorting
		if (!this._fetchingRecentItems) {
			// Only move to top if we're NOT using price sort
			if (this._sortType !== TYPE_PRICE && Settings.get("notification.monitor.bump0ETV")) {
				this.#moveNotifToTop(notif);
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
			SoundPlayer.play(TYPE_HIGHLIGHT);
		}

		//Move the notification to the top
		if (!this._fetchingRecentItems) {
			this.#moveNotifToTop(notif);
		}
	}

	#regularItemFound(notif, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		const tileVisible = this.#processNotificationFiltering(notif);

		//Play the regular notification sound effect.
		if ((tileVisible || this._fetchingRecentItems) && playSoundEffect) {
			SoundPlayer.play(TYPE_REGULAR);
		}
	}

	#processNotificationHighlight(notif) {
		const etvObj = notif.querySelector("div.etv");

		const isHighlighted =
			notif.dataset.typeHighlight == 1 && Settings.get("notification.monitor.highlight.colorActive");
		const isZeroETV = notif.dataset.typeZeroETV == 1 && Settings.get("notification.monitor.zeroETV.colorActive");
		const isUnknownETV = etvObj.dataset.etvMax == "" && Settings.get("notification.monitor.unknownETV.colorActive");

		const highlightColor = Settings.get("notification.monitor.highlight.color");
		const zeroETVColor = Settings.get("notification.monitor.zeroETV.color");
		const unknownETVColor = Settings.get("notification.monitor.unknownETV.color");

		if (isZeroETV && isHighlighted) {
			const color1 = zeroETVColor;
			const color2 = highlightColor;
			notif.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
		} else if (isUnknownETV && isHighlighted) {
			const color1 = unknownETVColor;
			const color2 = highlightColor;
			notif.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
		} else if (isHighlighted) {
			notif.style.backgroundColor = highlightColor;
		} else if (isZeroETV) {
			notif.style.backgroundColor = zeroETVColor;
		} else if (isUnknownETV) {
			notif.style.backgroundColor = unknownETVColor;
		} else {
			notif.style.backgroundColor = "unset";
		}
	}

	#blurItemFound(notif) {
		if (!notif) {
			return false;
		}

		//Blur the thumbnail and title
		notif.querySelector(".vh-img-container>img")?.classList.add("blur");
		notif.querySelector(".vvp-item-product-title-container>a")?.classList.add("dynamic-blur");
	}

	#processNotificationSorting() {
		const container = document.getElementById("vvp-items-grid");

		this.#preserveScrollPosition(() => {
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
		logger.add(`NOTIF: Hiding icon clicked for item ${asin}`);

		// Get the DOM element from our Map
		const tile = this.#getItemDOMElement(asin);
		if (tile) {
			this.#removeTile(tile, asin);
		}
	}

	#handleBrendaClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const queue = e.target.dataset.queue;

		let etv = document.querySelector("#vh-notification-" + asin + " .etv").dataset.etvMax;

		brendaAnnounceQueue.announce(asin, etv, queue, i13n.getDomainTLD());
	}

	#handlePinClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const isPinned = e.target.classList.contains("vh-icon-pin-active");
		const title = e.target.dataset.title;

		if (isPinned) {
			// Unpin the item
			PinnedList.removeItem(asin);

			// Update the icon
			e.target.classList.remove("vh-icon-pin-active");
			e.target.title = "Pin this item";

			// Display notification
			Notifications.pushNotification(
				new ScreenNotification({
					title: `Item ${asin} unpinned.`,
					lifespan: 3,
					content: title,
				})
			);
		} else {
			// Pin the item
			const isParentAsin = e.target.dataset.isParentAsin;
			const enrollmentGUID = e.target.dataset.enrollmentGuid;
			const queue = e.target.dataset.queue;
			const thumbnail = e.target.dataset.thumbnail;

			PinnedList.addItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID);

			// Update the icon
			e.target.classList.add("vh-icon-pin-active");
			e.target.title = "Unpin this item";

			// Display notification
			Notifications.pushNotification(
				new ScreenNotification({
					title: `Item ${asin} pinned.`,
					lifespan: 3,
					content: title,
				})
			);
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

		let m = DialogMgr.newModal("item-details-" + asin);
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

	#handleReportClick(e) {
		e.preventDefault(); // Prevent the default click behavior
		const asin = e.target.dataset.asin;

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
		}
	}

	#send_report(asin) {
		let manifest = chrome.runtime.getManifest();

		const content = {
			api_version: 5,
			app_version: manifest.version,
			country: i13n.getCountryCode(),
			action: "report_asin",
			uuid: Settings.get("general.uuid", false),
			asin: asin,
		};
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};

		showRuntime("Sending report...");

		//Send the report to VH's server
		fetch(VINE_HELPER_API_V5_URL, options).then(function () {
			alert("Report sent. Thank you.");
		});
	}

	//#######################################################
	//## UTILITY METHODS

	#moveNotifToTop(notif) {
		const container = document.getElementById("vvp-items-grid");

		this.#preserveScrollPosition(() => {
			// Insert the notification at the top
			container.insertBefore(notif, container.firstChild);
		});
	}

	#getNotificationByASIN(asin) {
		return this._items.get(asin)?.element;
	}

	#formatETV(etv) {
		let formattedETV = "";
		if (etv != null) {
			formattedETV = new Intl.NumberFormat(i13n.getLocale(), {
				style: "currency",
				currency: i13n.getCurrency(),
			}).format(etv);
		}
		return formattedETV;
	}

	_formatDate(date = null) {
		if (date == null) {
			date = new Date();
		}
		return new Intl.DateTimeFormat(i13n.getLocale(), {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: !Settings.get("notification.monitor.24hrsFormat"),
		}).format(date);
	}

	_updateTabTitle() {
		// Count visible items based on current filters
		let visibleCount = 0;

		// Loop through all items
		for (const [asin, item] of this._items.entries()) {
			// Skip items without DOM elements
			if (!item.element) continue;

			// Skip items hidden by style
			if (window.getComputedStyle(item.element).display === "none") continue;

			visibleCount++;
		}

		// Update the tab title
		document.title = "VHNM (" + visibleCount + ")";
	}

	_listeners() {
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
				this.#preserveScrollPosition(() => {
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
			Settings.set("notification.monitor.sortType", this._sortType);
			this.#processNotificationSorting();
			// Force immediate truncate when sort type changes
			this.#autoTruncate(true);
		});

		const filterType = document.querySelector("select[name='filter-type']");
		filterType.addEventListener("change", (event) => {
			this._filterType = filterType.value;
			Settings.set("notification.monitor.filterType", this._filterType);
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this._updateTabTitle();
		});

		const filterQueue = document.querySelector("select[name='filter-queue']");
		filterQueue.addEventListener("change", (event) => {
			this._filterQueue = filterQueue.value;
			Settings.set("notification.monitor.filterQueue", this._filterQueue);
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
			Settings.set("notification.monitor.autoTruncate", this._autoTruncateEnabled);
			// Force immediate truncate when auto truncate is enabled
			if (this._autoTruncateEnabled) {
				this.#autoTruncate(true);
			}
		});

		const autoTruncateLimitSelect = document.getElementById("auto-truncate-limit");
		autoTruncateLimitSelect.addEventListener("change", (event) => {
			Settings.set("notification.monitor.autoTruncateLimit", parseInt(autoTruncateLimitSelect.value));
			// Force immediate truncate when limit changes
			this.#autoTruncate(true);
		});

		//Message from within the context of the extension
		//Messages sent via: chrome.tabs.sendMessage(tab.id, data);
		//In this case, all messages are coming from the service_worker file.
		chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
			this._processBroadcastMessage(message);
		});
	}

	async _processBroadcastMessage(data) {
		if (data.type == undefined) {
			return false;
		}

		if (data.type == "pong") {
			window.clearTimeout(this._statusTimer);
			this.#setServiceWorkerStatus(true, "Service worker is running.");
		}
		if (data.type == "newETV") {
			this.#setETVFromASIN(data.asin, data.etv);
		}
		if (data.type == "wsOpen") {
			this.setWebSocketStatus(true);
		}
		if (data.type == "wsError") {
			this.setWebSocketStatus(false, data.error);
		}
		if (data.type == "wsClosed") {
			this.setWebSocketStatus(false);
		}
		if (data.type == "unpinnedItem") {
			// Update pin icon if this item was unpinned from another tab
			const notif = this.#getItemDOMElement(data.asin);
			if (notif) {
				const pinIcon = notif.querySelector(".vh-icon-pin");
				if (pinIcon && pinIcon.classList.contains("vh-icon-pin-active")) {
					pinIcon.classList.remove("vh-icon-pin-active");
					pinIcon.title = "Pin this item";
				}
			}
		}

		if (data.type == "unavailableItem") {
			// Update the item data first
			if (this.#hasItem(data.asin)) {
				const item = this._items.get(data.asin);
				item.data.unavailable = true;
				this._items.set(data.asin, item);
			}

			// Then update the DOM
			const notif = this.#getItemDOMElement(data.asin);
			this.#disableItem(notif);
		}
		if (data.type == "newItem") {
			await this.addTileInGrid(
				data.asin,
				data.queue,
				data.tier,
				data.date,
				data.title,
				data.img_url,
				data.is_parent_asin,
				data.enrollment_guid,
				data.etv_min,
				data.etv_max,
				data.reason,
				data.KW,
				data.KWsMatch,
				data.BlurKW,
				data.BlurKWsMatch,
				data.unavailable
			);
		}
		if (data.type == "fetch100") {
			for (const item of data.data) {
				if (item.type == "newItem") {
					await this.addTileInGrid(
						item.asin,
						item.queue,
						item.tier,
						item.date,
						item.title,
						item.img_url,
						item.is_parent_asin,
						item.enrollment_guid,
						item.etv_min,
						item.etv_max,
						item.reason,
						item.KW,
						item.KWsMatch,
						item.BlurKW,
						item.BlurKWsMatch,
						item.unavailable
					);
				} else if (item.type == "fetchRecentItemsEnd") {
					if (this._feedPaused) {
						//Unbuffer the feed
						document.getElementById("pauseFeed").click();
					}
					this._fetchingRecentItems = false;
				}
			}

			this.#processNotificationSorting();
			this._updateTabTitle();
		}
	}
}

export { NotificationMonitor };
