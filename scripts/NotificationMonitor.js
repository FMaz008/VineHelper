import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();

import { Internationalization } from "./Internationalization.js";
const i13n = new Internationalization();

import { Template } from "./Template.js";
var Tpl = new Template();

import { getRecommendationTypeFromQueue, generateRecommendationString } from "./Grid.js";

import { YMDHiStoISODate } from "./DateHelper.js";
import { HookMgr } from "./HookMgr.js";
var hookMgr = new HookMgr();

import { keywordMatch } from "./service_worker/keywordMatch.js";

import { NotificationsSoundPlayer } from "./NotificationsSoundPlayer.js";
const SoundPlayer = new NotificationsSoundPlayer();

import { PinnedListMgr } from "./PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { ScreenNotifier, ScreenNotification } from "./ScreenNotifier.js";
var Notifications = new ScreenNotifier();

import { unescapeHTML, removeSpecialHTML } from "./StringHelper.js";

import { TileSizer } from "./TileSizer.js";
var tileSizer = new TileSizer("notification.monitor.tileSize");

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
	#feedPaused = false;
	#feedPausedAmountStored;
	#fetchingRecentItems;
	#serviceWorkerStatusTimer;
	#waitTimer; //Timer which wait a short delay to see if anything new is about to happen
	#imageUrls; // Set of image URLs used for duplicate thumbnail detection (kept separate for O(1) lookup performance)
	#items; // Combined map to store both item data and DOM elements
	#gridContainer = null;
	#wsErrorMessage = null;
	#firefox = false;
	#mostRecentItemDate = null;
	#mostRecentItemDateDOM = null;
	#goldTier = true;
	#etvLimit = null;
	#itemTemplateFile = "tile_gridview.html";
	#channel = null; //Broadcast channel for light mode
	#lightMode = false;
	#statusTimer = null;
	#fetchLimit = 100;

	// UI User settings (will be loaded from storage)
	#autoTruncateEnabled = true;
	#filterQueue = -1;
	#filterType = -1;
	#sortType = TYPE_DATE;

	constructor() {
		this.#imageUrls = new Set();
		this.#items = new Map(); // Initialize the combined map to store all item data and DOM elements
		this.#feedPausedAmountStored = 0;
		this.#channel = new BroadcastChannel("VineHelper");

		this.#defineFetchLimit();
	}

	async #loadUIUserSettings() {
		// Load settings from chrome.storage.local
		await Settings.waitForLoad();

		//Get the filter and sorting settings
		this.#autoTruncateEnabled = Settings.get("notification.monitor.autoTruncate");
		this.#filterQueue = Settings.get("notification.monitor.filterQueue");
		this.#filterType = Settings.get("notification.monitor.filterType");
		this.#sortType = Settings.get("notification.monitor.sortType");

		// Update UI
		const autoTruncateCheckbox = document.getElementById("auto-truncate");
		if (autoTruncateCheckbox) autoTruncateCheckbox.checked = this.#autoTruncateEnabled;

		const filterQueueSelect = document.querySelector("select[name='filter-queue']");
		if (filterQueueSelect) filterQueueSelect.value = this.#filterQueue;

		const filterTypeSelect = document.querySelector("select[name='filter-type']");
		if (filterTypeSelect) filterTypeSelect.value = this.#filterType;

		const sortQueueSelect = document.querySelector("select[name='sort-queue']");
		if (sortQueueSelect) sortQueueSelect.value = this.#sortType;
	}

	async #defineFetchLimit() {
		await Settings.waitForLoad();

		//Define the fetch limit based on the user's tier
		if (Settings.isPremiumUser(3)) {
			this.#fetchLimit = 300;
		} else if (Settings.isPremiumUser(2)) {
			this.#fetchLimit = 200;
		} else {
			this.#fetchLimit = 100;
		}
	}

	async initialize() {
		if (Settings.get("notification.monitor.listView")) {
			this.#itemTemplateFile = "tile_listview.html";
		} else {
			this.#itemTemplateFile = "tile_gridview.html";
		}

		// Wait for settings to load before proceeding
		await this.settingsLoaded;

		//Remove the existing items.
		this.#gridContainer = document.querySelector("#vvp-items-grid");
		this.#gridContainer.innerHTML = "";

		//Create the event listeners
		this.#createEventListeners();

		//Check if the user is a gold tier user
		this.#updateGoldStatus();

		//Remove the item count
		this.#hideSelector("#vvp-items-grid-container>p");

		//Remove the navigation
		this.#hideSelector("#vvp-items-grid-container > div[role=navigation]");

		//Remove the categories
		this.#hideSelector("#vvp-browse-nodes-container");

		//Desktop header/footer
		this.#hideSelector("#vvp-header, #navFooter, ul.a-tabs");

		//Mobile header/footer
		this.#hideSelector("header, footer");

		//Remove the search bar
		this.#hideSelector(".vvp-items-button-and-search-container");

		//Remove the carousel/suggested items
		this.#hideSelector("#rhf");

		//Remove the header add-ons
		this.#hideSelector(".amzn-ss-wrap");

		//Delete all the scripts
		document.querySelectorAll("head script, body script").forEach((elem) => {
			elem.remove();
		});

		//Remove any pre-existing VH header if the extension was reloaded
		const vhHeader = document.getElementById("vh-notifications-monitor-header");
		if (vhHeader) {
			vhHeader.remove();
			//Remove the tile size tool
			const tileSizeTool = document.getElementById("vh-tile-size-tool-container");
			if (tileSizeTool) {
				tileSizeTool.remove();
			}
		}

		//Remove the page width limitation
		document.querySelector(".vvp-body").style.maxWidth = "unset";
		document.querySelector(".vvp-body").style.minWidth = "unset";
		document.querySelector("body").style.minWidth = "unset";

		//Remove the margins
		document.querySelector(".vvp-body").style.margin = "0";
		document.querySelector(".vvp-body").style.padding = "0";

		document.querySelectorAll(".vvp-tab-content>*").forEach((elem) => {
			elem.style.margin = "0px";
		});
		document.querySelectorAll(".vvp-body>*+*").forEach((elem) => {
			elem.style.margin = "0px";
		});
		document.querySelectorAll(".a-section").forEach((elem) => {
			elem.style.margin = "0px";
		});

		//Check if the browser is firefox
		this.#firefox = navigator.userAgent.includes("Firefox");

		//Set the grid items size
		if (Settings.get("general.tileSize.enabled")) {
			const width = Settings.get("notification.monitor.tileSize.width");
			const grid = document.querySelector("#vvp-items-grid");
			grid.classList.add("vh-notification-monitor");
			grid.style.gridTemplateColumns = `repeat(auto-fill,minmax(${width}px,auto))`;
		}

		this.#updateTabTitle();

		//Insert the header
		const parentContainer = document.querySelector("div.vvp-tab-content");
		const mainContainer = document.querySelector("div.vvp-items-container");
		const topContainer = document.querySelector("div#vvp-items-grid-container");
		const itemContainer = document.querySelector("div#vvp-items-grid");

		let prom2 = await Tpl.loadFile("view/notification_monitor_header.html");
		Tpl.setVar("fetchLimit", this.#fetchLimit);
		const header = Tpl.render(prom2, true);
		parentContainer.insertBefore(header, mainContainer);

		// Update UI filters after header is inserted
		this.#loadUIUserSettings();

		//Insert the VH tab container for the items even if there is no tabs
		const tabContainer = document.createElement("div");
		tabContainer.id = "vh-tabs";
		itemContainer.classList.add("tab-grid");

		if (
			Settings.get("thorvarium.mobileios") ||
			Settings.get("thorvarium.mobileandroid") ||
			Settings.get("thorvarium.smallItems")
		) {
			tabContainer.classList.add("smallitems");
		}

		//Assign the tab to the top container
		topContainer.appendChild(tabContainer);

		//Assign the item container to the tab container
		tabContainer.appendChild(itemContainer);

		if (Settings.get("notification.monitor.listView")) {
			this.#gridContainer.classList.add("listview");
		}

		//Display tile size widget if the list view is not active and the tile size is active
		if (Settings.get("general.tileSize.active") && !Settings.get("notification.monitor.listView")) {
			this.#initTileSizeWidget();
		}

		//Service worker status
		this.#updateServiceWorkerStatus();

		//Create a timer to check if the service worker is still running
		this.#createServiceWorkerStatusTimer();

		//Obtain the status of the WebSocket connection.
		chrome.runtime.sendMessage({
			type: "wsStatus",
		});

		document.getElementById("date_loaded").innerText = this.#formatDate();
		this.#mostRecentItemDateDOM = document.getElementById("date_most_recent_item");

		if (!this.#firefox && Settings.get("notification.monitor.openLinksInNewTab") != "1") {
			if (Settings.get("notification.monitor.preventUnload")) {
				this.#preventRedirections();
			}
		}

		//Activate the listeners
		this.#listeners();

		//Change the tab's favicon
		this.#updateTabFavicon();
	}

	async initializeLight() {
		this.#lightMode = true;
		this.#itemTemplateFile = "tile_lightview.html";

		// Wait for settings to load before proceeding
		await this.settingsLoaded;

		//Insert the header
		const parentContainer = document.querySelector("body");

		const prom2 = await Tpl.loadFile("view/notification_monitor_header.html");
		Tpl.setVar("fetchLimit", this.#fetchLimit);
		const header = Tpl.render(prom2, true);
		parentContainer.appendChild(header);

		// Update UI filters after header is inserted
		this.#loadUIUserSettings();

		const itemContainer = document.createElement("div");
		itemContainer.id = "vvp-items-grid";
		parentContainer.appendChild(itemContainer);

		this.#gridContainer = document.querySelector("#vvp-items-grid");

		//Create the event listeners
		this.#createEventListeners();

		//Obtain the status of the WebSocket connection.
		chrome.runtime.sendMessage({
			type: "wsStatus",
		});

		i13n.setCountryCode(Settings.get("general.country"));
		document.getElementById("date_loaded").innerText = this.#formatDate();
		this.#mostRecentItemDateDOM = document.getElementById("date_most_recent_item");

		this.#listeners();

		this.#broadcastChannel();

		this.#updateTabTitle();
	}

	#broadcastChannel() {
		this.#channel.onmessage = (event) => {
			this.#processBroadcastMessage(event.data);
		};
		this.#updateServiceWorkerStatus();
		this.#channel.postMessage({ type: "wsStatus" });
	}

	#updateTabFavicon() {
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

	#hideSelector(selector) {
		try {
			document.querySelectorAll(selector).forEach((elem) => {
				elem.style.display = "none";
			});
		} catch (err) {
			//Do nothing
		}
	}
	#updateGoldStatus() {
		let gold = true;
		try {
			gold =
				JSON.parse(document.querySelector(`script[data-a-state='{"key":"vvp-context"}']`).innerHTML)
					?.voiceDetails.tierStatus == "TIER2";
		} catch (err) {
			//Keep gold at true
		}
		this.#goldTier = gold;

		logger.add("NOTIF: Gold tier: " + this.#goldTier);
		if (!this.#goldTier) {
			//Get the maximum allowed value
			const rawText = document.querySelector("#vvp-vine-participation-content ul>li").innerText;
			const regex = new RegExp("^.+?[0-9]{1}.+?([0-9,.]+).+", "m");
			const match = rawText.match(regex);
			if (match) {
				this.#etvLimit = parseFloat(match[1]);
				logger.add("NOTIF: ETV limit: " + this.#etvLimit);
			}
		}
	}
	async #initTileSizeWidget() {
		if (Settings.get("notification.monitor.listView")) {
			return;
		}
		const container = document.querySelector("#vvp-items-grid-container");
		if (container) {
			if (Settings.get("general.tileSize.enabled")) {
				//Inject the GUI for the tile sizer widget
				tileSizer.injectGUI(container);
			}
		}

		//Display full descriptions
		//Not all of them are loaded at this stage and some get skipped.
		//container.querySelector(".a-truncate-full").classList.remove("a-offscreen");
		//container.querySelector(".a-truncate-cut").style.display = "none";

		//Set the slider default value
		//Wait until the items are loaded.
		hookMgr.hookBind("tilesUpdated", () => {
			tileSizer.adjustAll();
		});
	}

	#preventRedirections() {
		//Prevent redirections
		//This is working but will display a popup in the browser
		window.addEventListener(
			"beforeunload",
			(event) => {
				event.stopPropagation();
				event.preventDefault();
				event.returnValue = "";

				console.log("Page unload prevented");
				return false;
			},
			true
		);

		// Create a proxy for window.location
		// Not sure this is working at all.
		const originalLocation = window.location;
		const locationProxy = new Proxy(originalLocation, {
			set: function (obj, prop, value) {
				console.log(`Prevented changing location.${prop} to ${value}`);
				return true; // Pretend we succeeded
			},
			get: function (obj, prop) {
				if (prop === "href") {
					return originalLocation.href;
				}
				if (typeof obj[prop] === "function") {
					return function () {
						console.log(`Prevented calling location.${prop}`);
						return false;
					};
				}
				return obj[prop];
			},
		});
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

		date = new Date(YMDHiStoISODate(date));
		// Create the item data object
		const itemData = {
			asin,
			queue,
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
				element.dataset.recommendationId = recommendationId;
				element.querySelector(`input[data-asin='${asin}']`).dataset.recommendationId = recommendationId;

				if (!itemData.unavailable) {
					this.#enableItem(element);
				}
				return element;
			}
		}

		// Check if the de-duplicate image setting is on
		if (Settings.get("notification.monitor.hideDuplicateThumbnail")) {
			if (this.#imageUrls.has(img_url)) {
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

		let prom2 = await Tpl.loadFile("view/" + this.#itemTemplateFile);
		Tpl.setVar("id", asin);
		Tpl.setVar("domain", i13n.getDomainTLD());
		Tpl.setVar("img_url", img_url);
		Tpl.setVar("asin", asin);
		Tpl.setVar("dateReceived", this.#formatDate(this.#currentDateTime()));
		Tpl.setVar("date", this.#formatDate(date));
		Tpl.setVar("feedPaused", this.#feedPaused);
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

		// Insert the tile based on sort type
		if (this.#sortType === TYPE_PRICE) {
			if (etv_min !== null) {
				// For price sorting, find the correct position and insert there
				const newPrice = parseFloat(etv_min) || 0;
				let insertPosition = null;

				// Find the first item with a lower price
				const existingItems = Array.from(this.#items.entries());
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
					this.#gridContainer.insertBefore(fragment, insertPosition);
				} else {
					// If no position found or item has highest price, append to the end

					this.#gridContainer.appendChild(fragment);
				}
			} else {
				// If no ETV min, append to the end
				this.#gridContainer.appendChild(fragment);
			}
		} else {
			// For other sort types, just insert at the beginning

			this.#gridContainer.insertBefore(fragment, this.#gridContainer.firstChild);
		}

		// Store a reference to the DOM element
		this.#storeItemDOMElement(asin, tileDOM);

		//Set the tile custom dimension according to the settings.
		if (!this.#lightMode && !Settings.get("notification.monitor.listView")) {
			tileSizer.adjustAll(tileDOM);
		}
		//Add tool tip to the truncated item title link
		if (!this.#lightMode && Settings.get("general.displayFullTitleTooltip")) {
			const titleDOM = tileDOM.querySelector(".a-link-normal");
			tooltip.addTooltip(titleDOM, title);
		}

		//If the feed is paused, up the counter and rename the Resume button
		if (this.#feedPaused) {
			this.#feedPausedAmountStored++;
			document.getElementById("pauseFeed").value = `Resume Feed (${this.#feedPausedAmountStored})`;
			document.getElementById("pauseFeed-fixed").value = `Resume Feed (${this.#feedPausedAmountStored})`;
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

		if (this.#mostRecentItemDate == null || date > this.#mostRecentItemDate) {
			this.#mostRecentItemDateDOM.innerText = this.#formatDate(date);
			this.#mostRecentItemDate = date;
		}

		//Apply the filters
		this.#processNotificationFiltering(tileDOM);

		//Update the tab title:
		//User a timer to avoid the Fetch Last 100 to call this 100 times, which slow things down.
		window.clearTimeout(this.#waitTimer);
		this.#waitTimer = window.setTimeout(() => {
			this.#updateTabTitle();
		}, 250);

		//Autotruncate the items if there are too many
		this.#autoTruncate();

		return tileDOM; //Return the DOM element for the tile.
	}

	#createEventListeners() {
		// Bind the click handler to the instance and then add as event listener
		this.#gridContainer.addEventListener("click", (e) => this.#clickHandler(e));
	}

	#clickHandler(e) {
		e.preventDefault();

		//Check if the closes element is .vh-icon-search
		const searchLink = e.target.closest(".vh-icon-search");
		if (searchLink) {
			window.open(searchLink.parentElement.href, "_blank");
			return;
		}

		//Check if the closest element is .vh-icon-report
		const reportLink = e.target.closest(".vh-icon-report");
		if (reportLink) {
			this.#handleReportClick(e);
			return;
		}

		//Check if the closest element is .vh-icon-announcement
		const announceLink = e.target.closest(".vh-icon-announcement");
		if (announceLink) {
			if (Settings.get("discord.active") && Settings.get("discord.guid", false) != null) {
				this.#handleBrendaClick(e);
				return;
			}
		}

		//Check if the closest element is .vh-icon-pin
		const pinLink = e.target.closest(".vh-icon-pin");
		if (pinLink) {
			if (Settings.get("pinnedTab.active")) {
				this.#handlePinClick(e);
				return;
			}
		}

		//Check if the closest element is .vh-icon-hide
		const hideLink = e.target.closest(".vh-icon-hide");
		if (hideLink) {
			this.#handleHideClick(e);
			return;
		}

		//Check if the closest element is .vh-icon-question
		const detailsIcon = e.target.closest(".vh-icon-question");
		if (detailsIcon) {
			this.#handleDetailsClick(e);
			return;
		}

		//Add the click listener for the See Details button
		if (this.#firefox || Settings.get("notification.monitor.openLinksInNewTab") == "1") {
			//Deactivate Vine click handling

			const btnContainer = e.target.closest(".vvp-details-btn");
			const seeDetailsBtn = e.target.closest(".a-button-primary input");
			if (seeDetailsBtn) {
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
			}
		}
	}

	#currentDateTime() {
		return new Date();
	}

	// Add or update item data in the Map
	#addItemData(asin, itemData) {
		// Create a new item object or update existing one

		if (!this.#items.has(asin)) {
			// New item
			this.#items.set(asin, {
				data: {
					...itemData,
					dateAdded: this.#currentDateTime(),
				},
				element: null, // Element will be set later
			});
		} else {
			// Update existing item data, preserving the element reference
			const existing = this.#items.get(asin);
			this.#items.set(asin, {
				data: {
					...existing.data,
					...itemData,
				},
				element: existing.element,
			});
		}

		// Store image URL if needed for duplicate detection
		if (itemData.img_url && Settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this.#imageUrls.add(itemData.img_url);
		}

		// Sort the items after adding or updating a new item
		this.#sortItems();
	}

	#sortItems() {
		// Only proceed if there are items to sort
		if (this.#items.size === 0) return;

		// Convert Map to array for sorting
		const itemsArray = Array.from(this.#items.entries()).map(([asin, item]) => {
			return {
				asin,
				data: item.data,
				element: item.element,
			};
		});

		// Sort based on the current sort type
		itemsArray.sort((a, b) => {
			if (this.#sortType === TYPE_DATE) {
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
		this.#items = new Map(
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

	// Update item data with ETV
	#updateItemETV(asin, etv) {
		if (!this.#items.has(asin)) {
			return false;
		}

		const item = this.#items.get(asin);

		// Update min and max ETV values
		if (!item.data.etv_min || etv < item.data.etv_min) {
			item.data.etv_min = etv;
		}

		if (!item.data.etv_max || etv > item.data.etv_max) {
			item.data.etv_max = etv;
		}

		// Update the Map
		this.#items.set(asin, item);
		// Sort the items after adding or updating a new item
		this.#sortItems();

		return true;
	}

	// Store DOM element reference
	#storeItemDOMElement(asin, element) {
		if (this.#items.has(asin)) {
			const item = this.#items.get(asin);
			item.element = element;
			this.#items.set(asin, item);
		} else {
			// Should not happen, but handle the case
			this.#items.set(asin, {
				data: {
					asin: asin,
					dateAdded: this.#currentDateTime(),
				},
				element: element,
			});
		}
	}

	// Get DOM element for an item
	#getItemDOMElement(asin) {
		return this.#items.get(asin)?.element;
	}

	// Check if an item exists
	#hasItem(asin) {
		return this.#items.has(asin);
	}

	// Remove item completely
	#removeTile(tile, asin, countTotalTiles = true) {
		if (!tile || !asin) {
			return;
		}

		// Get the item data to access its image URL
		const item = this.#items.get(asin);
		const imgUrl = item?.data?.img_url;

		// Remove the tooltip
		const a = tile.querySelector(".a-link-normal");
		if (a) {
			tooltip.removeTooltip(a);
		}

		// Remove from data structures
		this.#items.delete(asin);

		// Also remove the image URL from the set if duplicate detection is enabled
		if (imgUrl && Settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this.#imageUrls.delete(imgUrl);
		}

		// Remove the element from DOM
		tile.remove();

		if (countTotalTiles) {
			this.#updateTabTitle(); // Update the tab counter
		}
	}

	async setETVFromASIN(asin, etv) {
		// Store old ETV value to detect if reordering is needed
		const oldETV = this.#items.get(asin)?.data?.etv_min || 0;

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
		if (this.#sortType === TYPE_PRICE) {
			const newETV = this.#items.get(asin)?.data?.etv_min || 0;

			// Only reposition if the ETV changed significantly enough to potentially affect order
			if (Math.abs(newETV - oldETV) > 0.01) {
				// Remove the element from DOM
				notif.remove();

				// Find the correct position to insert
				const newPrice = parseFloat(newETV);
				let insertPosition = null;

				// Find the first item with a lower price
				for (const [existingAsin, item] of this.#items.entries()) {
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
					this.#gridContainer.insertBefore(notif, insertPosition);
				} else {
					// If no position found or item has highest price, append to the end
					this.#gridContainer.appendChild(notif);
				}
			}
		}

		return true;
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
			etvObj.style.display = this.#lightMode ? "inline-block" : "block";
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

		//If the user if silver, remove he items which are above the threshold
		if (!this.#goldTier) {
			if (this.#etvLimit != null && parseFloat(etvObj.dataset.etvMin) > this.#etvLimit) {
				//Remove the See Details button for item outside the tier limit.
				notif.querySelector(".vvp-details-btn")?.remove();
			}
		}
	}

	setWebSocketStatus(status, message = null) {
		const icon = document.querySelector("#statusWS div.vh-switch-32");
		const description = document.querySelector("#descriptionWS");
		if (status) {
			icon.classList.remove("vh-icon-switch-off");
			icon.classList.add("vh-icon-switch-on");
			description.innerText = "Listening for notifications...";
			this.#wsErrorMessage = null;
		} else {
			icon.classList.remove("vh-icon-switch-on");
			icon.classList.add("vh-icon-switch-off");
			if (message) {
				this.#wsErrorMessage = message;
				description.innerText = message;
			} else if (this.#wsErrorMessage == null) {
				description.innerText = "Not connected. Retrying in 30 sec...";
			}
		}
	}

	#createServiceWorkerStatusTimer() {
		this.#serviceWorkerStatusTimer = window.setInterval(() => {
			this.#updateServiceWorkerStatus();
		}, 10000);
	}

	#updateServiceWorkerStatus() {
		if (!Settings.get("notification.active")) {
			this.#setServiceWorkerStatus(false, "You need to enable the notifications in the settings.");
		} else if (i13n.getCountryCode() === null) {
			this.#setServiceWorkerStatus(
				false,
				"Your country has not been detected, ensure to load a vine page first."
			);
		} else if (i13n.getDomainTLD() === null) {
			this.#setServiceWorkerStatus(
				false,
				"No valid country found. You current country is detected as: '" +
					i13n.getCountryCode() +
					"', which is not currently supported by Vine Helper. Reach out so we can add it!"
			);
		} else if (Settings.get("notification.active")) {
			//Send a message to the service worker to check if it is still running
			this.#statusTimer = window.setTimeout(() => {
				this.#setServiceWorkerStatus(false, "Not responding, reload the page.");
			}, 500);
			try {
				chrome.runtime.sendMessage({ type: "ping" });
				this.#channel.postMessage({ type: "ping" });
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
		if ((tileVisible || this.#fetchingRecentItems) && playSoundEffect) {
			SoundPlayer.play(TYPE_ZEROETV);
		}

		//Highlight for ETV
		const highlightColor = Settings.get("notification.monitor.highlight.colorActive");
		const zeroETVColor = Settings.get("notification.monitor.zeroETV.colorActive");
		if (notif.dataset.typeHighlight == 1 && highlightColor && zeroETVColor) {
			const color1 = Settings.get("notification.monitor.zeroETV.color");
			const color2 = Settings.get("notification.monitor.highlight.color");
			notif.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
		} else {
			if (zeroETVColor) {
				notif.style.backgroundColor = Settings.get("notification.monitor.zeroETV.color");
			}
		}

		//Move the notification to the top only if we're not using price-based sorting
		if (!this.#fetchingRecentItems) {
			// Only move to top if we're NOT using price sort
			if (this.#sortType !== TYPE_PRICE) {
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
		if ((tileVisible || this.#fetchingRecentItems) && playSoundEffect) {
			SoundPlayer.play(TYPE_HIGHLIGHT);
		}

		//Highlight for Highlighted item
		const highlightColor = Settings.get("notification.monitor.highlight.colorActive");
		if (highlightColor) {
			notif.style.backgroundColor = Settings.get("notification.monitor.highlight.color");
		}

		//Move the notification to the top
		if (!this.#fetchingRecentItems) {
			this.#moveNotifToTop(notif);
		}
	}

	#regularItemFound(notif, playSoundEffect = true) {
		if (!notif) {
			return false;
		}

		const tileVisible = this.#processNotificationFiltering(notif);

		//Play the regular notification sound effect.
		if ((tileVisible || this.#fetchingRecentItems) && playSoundEffect) {
			SoundPlayer.play(TYPE_REGULAR);
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

		if (this.#filterType == -1) {
			node.style.display = this.#lightMode ? "block" : "flex";
		} else if (this.#filterType == TYPE_HIGHLIGHT_OR_ZEROETV) {
			node.style.display =
				notificationTypeZeroETV || notificationTypeHighlight ? (this.#lightMode ? "block" : "flex") : "none";
		} else if (this.#filterType == TYPE_HIGHLIGHT) {
			node.style.display = notificationTypeHighlight ? (this.#lightMode ? "block" : "flex") : "none";
		} else if (this.#filterType == TYPE_ZEROETV) {
			node.style.display = notificationTypeZeroETV ? (this.#lightMode ? "block" : "flex") : "none";
		} else if (this.#filterType == TYPE_REGULAR) {
			node.style.display =
				!notificationTypeZeroETV && !notificationTypeHighlight ? (this.#lightMode ? "block" : "flex") : "none";
		}

		//Queue filter
		if (node.style.display == "flex" || node.style.display == "block") {
			if (this.#filterQueue == "-1") {
				return true;
			} else {
				node.style.display = queueType == this.#filterQueue ? (this.#lightMode ? "block" : "flex") : "none";
				return queueType == this.#filterQueue;
			}
		} else {
			return false;
		}
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
		const isParentAsin = e.target.dataset.isParentAsin;
		const enrollmentGUID = e.target.dataset.enrollmentGuid;
		const queue = e.target.dataset.queue;
		const title = e.target.dataset.title;
		const thumbnail = e.target.dataset.thumbnail;

		PinnedList.addItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID);

		//Display notification
		Notifications.pushNotification(
			new ScreenNotification({
				title: `Item ${asin} pinned.`,
				lifespan: 3,
				content: title,
			})
		);
	}

	#handleDetailsClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const date = e.target.dataset.date;
		const dateReceived = e.target.dataset.dateReceived;
		const reason = e.target.dataset.reason;
		const highlightKW = e.target.dataset.highlightkw;
		const blurKW = e.target.dataset.blurkw;
		const queue = e.target.dataset.queue;

		let m = DialogMgr.newModal("item-details-" + asin);
		m.title = "Item " + asin;
		m.content =
			"<ul>" +
			"<li>Broadcast date/time: " +
			date +
			"</li>" +
			"<li>Received date/time: " +
			dateReceived +
			"</li>" +
			"<li>Broadcast reason: " +
			reason +
			"</li>" +
			"<li>Queue: " +
			queue +
			"</li>" +
			"<li>Highlight Keyword: " +
			highlightKW +
			"</li>" +
			"<li>Blur Keyword: " +
			blurKW +
			"</li></ul>";
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
		container.insertBefore(notif, container.firstChild);
	}

	#getNotificationByASIN(asin) {
		return this.#items.get(asin)?.element;
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

	#formatDate(date = null) {
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

	#autoTruncate(max = 1000) {
		// Auto truncate
		if (this.#autoTruncateEnabled) {
			// Check if we need to truncate based on map size
			if (this.#items.size > max) {
				logger.add(`NOTIF: Auto truncating item(s) from the page using the ${this.#sortType} sort method.`);

				// Convert map to array for sorting
				const itemsArray = Array.from(this.#items.entries()).map(([asin, item]) => ({
					asin,
					date: new Date(item.data.date),
					price: parseFloat(item.data.etv_min) || 0,
					element: item.element,
				}));

				// Sort according to current sort method, but reversed
				// (we want to remove lowest price or oldest items)
				if (this.#sortType === TYPE_PRICE) {
					itemsArray.sort((a, b) => a.price - b.price); // Sort lowest price first
				} else {
					itemsArray.sort((a, b) => a.date - b.date); // Sort oldest first (default)
				}

				// Remove the oldest/lowest-priced items exceeding the max
				const itemsToRemove = itemsArray.slice(0, itemsArray.length - max);

				for (const item of itemsToRemove) {
					if (item.element) {
						this.#removeTile(item.element, item.asin);
					} else {
						// Element not found but we should clean up the data
						this.#items.delete(item.asin);
					}
				}
			}
		}
	}

	#updateTabTitle() {
		// Count visible items based on current filters
		let visibleCount = 0;

		// Loop through all items
		for (const [asin, item] of this.#items.entries()) {
			// Skip items without DOM elements
			if (!item.element) continue;

			// Skip items hidden by style
			if (window.getComputedStyle(item.element).display === "none") continue;

			visibleCount++;
		}

		// Update the tab title
		document.title = "VHNM (" + visibleCount + ")";
	}

	#listeners() {
		// Add the fix toolbar with the pause button if we scroll past the original pause button
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

		fixedPauseBtn.addEventListener("click", () => {
			originalPauseBtn.click();
		});

		//Bind clear-monitor button
		const btnClearMonitor = document.getElementById("clear-monitor");
		btnClearMonitor.addEventListener("click", async (event) => {
			//Delete all items from the grid
			if (confirm("Clear all items?")) {
				for (const [asin, item] of this.#items.entries()) {
					if (item.element) {
						this.#removeTile(item.element, asin, false);
					}
				}

				this.#clearAllItemData();
				this.#updateTabTitle();
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
			this.#fetchingRecentItems = true;
			if (!this.#feedPaused) {
				document.getElementById("pauseFeed").click();
			}

			chrome.runtime.sendMessage({
				type: "fetchLatestItems",
				limit: this.#fetchLimit,
			});
		});

		//Bind Pause Feed button
		const btnPauseFeed = document.getElementById("pauseFeed");
		btnPauseFeed.addEventListener("click", (event) => {
			this.#feedPaused = !this.#feedPaused;
			if (this.#feedPaused) {
				this.#feedPausedAmountStored = 0;
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
				this.#updateTabTitle();
			}
		});

		// Bind sort and filter controls
		const sortQueue = document.querySelector("select[name='sort-queue']");
		sortQueue.addEventListener("change", (event) => {
			this.#sortType = sortQueue.value;
			Settings.set("notification.monitor.sortType", this.#sortType);
			this.#processNotificationSorting();
		});

		const filterType = document.querySelector("select[name='filter-type']");
		filterType.addEventListener("change", (event) => {
			this.#filterType = filterType.value;
			Settings.set("notification.monitor.filterType", this.#filterType);
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this.#updateTabTitle();
		});

		const filterQueue = document.querySelector("select[name='filter-queue']");
		filterQueue.addEventListener("change", (event) => {
			this.#filterQueue = filterQueue.value;
			Settings.set("notification.monitor.filterQueue", this.#filterQueue);
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this.#updateTabTitle();
		});

		const autoTruncateCheckbox = document.getElementById("auto-truncate");
		autoTruncateCheckbox.checked = this.#autoTruncateEnabled;
		autoTruncateCheckbox.addEventListener("change", (event) => {
			this.#autoTruncateEnabled = autoTruncateCheckbox.checked;
			Settings.set("notification.monitor.autoTruncate", this.#autoTruncateEnabled);
		});

		//Message from within the context of the extension
		//Messages sent via: chrome.tabs.sendMessage(tab.id, data);
		//In this case, all messages are coming from the service_worker file.
		chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
			this.#processBroadcastMessage(message);
		});
	}

	async #processBroadcastMessage(data) {
		if (data.type == undefined) {
			return false;
		}

		if (data.type == "pong") {
			window.clearTimeout(this.#statusTimer);
			this.#setServiceWorkerStatus(true, "Service worker is running.");
		}
		if (data.type == "newETV") {
			this.setETVFromASIN(data.asin, data.etv);
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

		if (data.type == "unavailableItem") {
			// Update the item data first
			if (this.#hasItem(data.asin)) {
				const item = this.#items.get(data.asin);
				item.data.unavailable = true;
				this.#items.set(data.asin, item);
			}

			// Then update the DOM
			const notif = this.#getItemDOMElement(data.asin);
			this.#disableItem(notif);
		}
		if (data.type == "newItem") {
			let {
				date,
				asin,
				title,
				reason,
				img_url,
				etv_min,
				etv_max,
				queue,
				KW,
				KWsMatch,
				BlurKW,
				BlurKWsMatch,
				is_parent_asin,
				enrollment_guid,
				unavailable,
			} = data;

			await this.addTileInGrid(
				asin,
				queue,
				date,
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
				unavailable
			);
		}
		if (data.type == "fetch100") {
			for (const item of data.data) {
				if (item.type == "newItem") {
					await this.addTileInGrid(
						item.asin,
						item.queue,
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
					if (this.#feedPaused) {
						//Unbuffer the feed
						document.getElementById("pauseFeed").click();
					}
					this.#fetchingRecentItems = false;
				}
			}

			this.#processNotificationSorting();
		}
	}

	// Clear all item-related data structures
	#clearAllItemData() {
		this.#items.clear();
		this.#imageUrls.clear();
		this.#mostRecentItemDate = null;
		if (this.#mostRecentItemDateDOM) {
			this.#mostRecentItemDateDOM.innerText = "";
		}
	}
}

export { NotificationMonitor };
