// chrome global is used in subclasses
// eslint-disable-next-line no-unused-vars
/*global chrome*/

//This file serve the main purpose of reducing the size of the NotificationMonitor.js file.
//It:
// - contain the variables specific to V2 or V3
// - instanciate the specific classes for V2 or V3
// - instanciate the general purpose classes
// - contains some basic functions that are used by the NotificationMonitor that where good to get out of the way.

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
import { Template } from "/scripts/core/utils/Template.js";
import { Environment } from "/scripts/core/services/Environment.js";
import { Logger } from "/scripts/core/utils/Logger.js";
import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
import { PinMgr } from "/scripts/notifications-monitor/services/PinMgr.js";
import { HookMgr } from "/scripts/core/utils/HookMgr.js";
import { Internationalization } from "/scripts/core/services/Internationalization.js";
import { ScreenNotifier, ScreenNotification } from "/scripts/ui/components/ScreenNotifier.js";
import { Tooltip } from "/scripts/ui/components/Tooltip.js";
import { BrendaAnnounceQueue } from "/scripts/core/services/BrendaAnnounce.js";
import { ModalMgr } from "/scripts/ui/controllers/ModalMgr.js";
import { NotificationsSoundPlayer } from "/scripts/ui/components/NotificationsSoundPlayer.js";
import { ServerCom } from "/scripts/notifications-monitor/stream/ServerCom.js";
import { ItemsMgr } from "/scripts/notifications-monitor/services/ItemsMgr.js";
import { Websocket } from "/scripts/notifications-monitor/stream/Websocket.js";
import { AutoLoad } from "/scripts/notifications-monitor/stream/AutoLoad.js";
import { MasterSlave } from "/scripts/notifications-monitor/coordination/MasterSlave.js";
import { TileCounter } from "/scripts/notifications-monitor/services/TileCounter.js";
import { NoShiftGrid } from "/scripts/notifications-monitor/services/NoShiftGrid.js";
import { DIContainer } from "/scripts/infrastructure/DIContainer.js";
import { ErrorAlertManager } from "/scripts/notifications-monitor/services/ErrorAlertManager.js";

class MonitorCore {
	#container;

	//Variables linked to monitor V2 vs V3
	_monitorV2 = false; //True if the monitor is in V2 mode
	_monitorV3 = false; //True if the monitor is in V3 mode
	_tileSizer = null; //The tile sizer tool for v3 monitor
	_tierMgr = null; //The tier manager object
	_ws = null; //The websocket object
	_autoLoad = null; //The auto load object
	_isMasterMonitor = false; //True if the monitor is the master monitor
	_noShiftGrid = null; //The no shift grid object

	_fetchLimit = 100; //The fetch limit for the monitor
	_tabTitleTimer = null; // Timer for batching tab title updates
	_gridContainer = null; //The grid container DOM element
	_channel = null;

	constructor(monitorV3 = false) {
		// Prevent direct instantiation of the abstract class
		if (this.constructor === MonitorCore) {
			throw new TypeError('Abstract class "MonitorLib" cannot be instantiated directly.');
		}

		this._gridContainer = document.querySelector("#vvp-items-grid");

		// Initialize DI container for this component
		// This demonstrates how we can gradually migrate to DI
		this.#container = new DIContainer();
		this.#registerServices();

		this._channel = new BroadcastChannel("vinehelper-notification-monitor");
		this._monitorV3 = monitorV3;

		//General purpose classes
		this._settings = new SettingsMgr();
		this._env = new Environment();
		this._tpl = new Template();
		this._log = new Logger();
		this._cryptoKeys = new CryptoKeys();
		this._i13nMgr = new Internationalization();
		this._notificationsMgr = new ScreenNotifier();
		this._tooltipMgr = new Tooltip();
		this._brendaMgr = new BrendaAnnounceQueue();
		this._dialogMgr = new ModalMgr();
		this._soundPlayerMgr = new NotificationsSoundPlayer();
		this._hookMgr = new HookMgr();
		this._masterSlave = new MasterSlave(this);
		this._tileCounter = new TileCounter(this);
		if (this._env.data.gridDOM) {
			//v3
			this._env.data.gridDOM.regular = document.getElementById("vvp-items-grid");
		} else {
			//v2
			this._env.data.gridDOM = { regular: document.getElementById("vvp_items-grid") };
		}

		//Notifications Monitor's specific classes
		this._serverComMgr = new ServerCom(this);

		this._itemsMgr = new ItemsMgr(this._settings);

		this._pinMgr = new PinMgr();
		this._pinMgr.setGetItemDOMElementCallback(this._itemsMgr.getItemDOMElement.bind(this._itemsMgr));

		this.#getFetchLimit();

		if (
			this._settings.get("notification.monitor.placeholders") &&
			!this._settings.get("notification.monitor.listView") &&
			this._settings.get("general.tileSize.enabled")
		) {
			this._noShiftGrid = new NoShiftGrid(this);
			this._noShiftGrid.initialize(this._gridContainer);

			// Update the dependency registrations with the actual instances
			this.#container.register("noShiftGrid", () => this._noShiftGrid);

			// Insert initial placeholders after DOM is ready and grid has width
			this._noShiftGrid.insertPlaceholderTiles();
		}

		// New service uses DI
		this._errorAlertManager = this.#container.resolve("errorAlertManager");
	}

	/**
	 * Register services in the DI container
	 * This is where we define how services are created and their dependencies
	 */
	#registerServices() {
		// Register ErrorAlertManager as a singleton
		// No dependencies for now, but this makes it easy to add them later
		this.#container.register("errorAlertManager", () => new ErrorAlertManager(), {
			singleton: true,
		});

		// Register dependencies that the -now deleted- GridEventManager needs
		// These are registered as factories (not singletons) since they're provided externally
		this.#container.register("hookMgr", () => this._hookMgr);
		this.#container.register("monitor", () => this);
		this.#container.register("settings", () => this._settings);

		// Future services can be registered here as we migrate them
		// Example for when TileSizer is migrated:
		// this.#container.register('tileSizer', () => new TileSizer("notification.monitor.tileSize"), {
		//     singleton: true
		// });
	}

	setMasterMonitor() {
		//console.log("[MonitorCore] Setting as MASTER monitor"); // eslint-disable-line no-console
		this._isMasterMonitor = true;
		this._ws = new Websocket(this);
		this._autoLoad = new AutoLoad(this, this._ws);
		//console.log("[MonitorCore] WebSocket and AutoLoad initialized"); // eslint-disable-line no-console
	}
	setSlaveMonitor() {
		//console.log("[MonitorCore] Setting as SLAVE monitor"); // eslint-disable-line no-console
		this._isMasterMonitor = false;
		if (this._ws !== null) {
			this._ws.destroyInstance();
		}
		this._ws = null;
		this._autoLoad = null;
	}

	fetchAutoLoadUrl(url, queue, page) {
		if (this._autoLoad) {
			this._autoLoad.fetchAutoLoadUrl(url, queue, page);
		}
	}
	//###############################################
	//## UI update functions
	//###############################################

	_updateUserTierInfo() {
		const userTierInfo = document.getElementById("user-tier-info");
		if (userTierInfo) {
			//Create a div for the medal icon
			const medalIcon = document.createElement("div");
			medalIcon.classList.add(this._tierMgr.isGold() ? "vh-icon-medal-gold" : "vh-icon-medal-silver");
			medalIcon.classList.add("vh-icon-16");
			userTierInfo.innerHTML = `[Tier: ${medalIcon.outerHTML} ${this._tierMgr.getTier()}] [Limit: ${this._tierMgr.getLimit()}]`;
		}
	}

	async #getFetchLimit() {
		await this._settings.waitForLoad();

		//Define the fetch limit based on the user's tier
		if (this._settings.isPremiumUser(3)) {
			this._fetchLimit = 300;
		} else if (this._settings.isPremiumUser(2)) {
			this._fetchLimit = 200;
		} else {
			this._fetchLimit = 100;
		}
	}

	_displayToasterNotification(data) {
		this._notificationsMgr.pushNotification(new ScreenNotification(data));
	}

	async _loadUIUserSettings() {
		// Load settings from chrome.storage.local
		await this._settings.waitForLoad();

		//Get the filter and sorting settings
		this._autoTruncateEnabled = this._settings.get("notification.monitor.autoTruncate");
		this._filterQueue = this._settings.get("notification.monitor.filterQueue");
		this._filterType = this._settings.get("notification.monitor.filterType");
		this._sortType = this._settings.get("notification.monitor.sortType");

		// Update UI
		const autoTruncateCheckbox = document.getElementById("auto-truncate");
		if (autoTruncateCheckbox) autoTruncateCheckbox.checked = this._autoTruncateEnabled;

		const autoTruncateLimit = document.getElementById("auto-truncate-limit");
		if (autoTruncateLimit)
			autoTruncateLimit.value = this._settings.get("notification.monitor.autoTruncateLimit").toString();

		const filterQueueSelect = document.querySelector("select[name='filter-queue']");
		if (filterQueueSelect) filterQueueSelect.value = this._filterQueue;

		const filterTypeSelect = document.querySelector("select[name='filter-type']");
		if (filterTypeSelect) filterTypeSelect.value = this._filterType;

		const sortQueueSelect = document.querySelector("select[name='sort-queue']");
		if (sortQueueSelect) sortQueueSelect.value = this._sortType;
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

	async _enableItem(notif) {
		if (!notif) {
			return false;
		}
		notif.style.opacity = "1";
		notif.style.filter = "brightness(1)";
		notif.querySelector(".unavailable-banner")?.remove();
	}

	async _disableItem(notif) {
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

	/**
	 * Check if an item has unknown ETV
	 * @param {Element} etvObj - The ETV element
	 * @returns {boolean} - True if ETV is unknown
	 */
	isUnknownETV(etvObj) {
		// Check for both empty string and items that haven't had ETV set yet
		// When items have unknown ETV, the dataset attributes remain empty strings
		// but the item data might have null values
		return etvObj && (etvObj.dataset.etvMax == "" || etvObj.dataset.etvMax == null);
	}

	_processNotificationHighlight(notif) {
		if (!notif) {
			return false;
		}

		const isHighlighted =
			notif.dataset.typeHighlight == 1 && this._settings.get("notification.monitor.highlight.colorActive");
		const isZeroETV =
			notif.dataset.typeZeroETV == 1 && this._settings.get("notification.monitor.zeroETV.colorActive");
		const isUnknownETV =
			notif.dataset.typeUnknownETV == 1 && this._settings.get("notification.monitor.unknownETV.colorActive");

		const highlightColor = this._settings.get("notification.monitor.highlight.color");
		const zeroETVColor = this._settings.get("notification.monitor.zeroETV.color");
		const unknownETVColor = this._settings.get("notification.monitor.unknownETV.color");
		const debugItemProcessing = this._settings.get("general.debugItemProcessing");
		const ignoreUnknownETVhighlight = this._settings.get(
			"notification.monitor.highlight.ignoreUnknownETVhighlight"
		);
		const ignore0ETVhighlight = this._settings.get("notification.monitor.highlight.ignore0ETVhighlight");
		// Debug logging for styling application
		if (debugItemProcessing) {
			const asin = notif.id?.replace("vh-notification-", "") || "unknown";
			console.log("[DEBUG-ETV-STYLING] Processing highlight/color for item:", {
				asin,
				typeHighlight: notif.dataset.typeHighlight,
				typeZeroETV: notif.dataset.typeZeroETV,
				typeUnknownETV: notif.dataset.typeUnknownETV,
				isHighlighted,
				isZeroETV,
				isUnknownETV,
				ignoreUnknownETVhighlight: ignoreUnknownETVhighlight,
				ignore0ETVhighlight: ignore0ETVhighlight,
				willApplyStriped:
					(isUnknownETV && isHighlighted && !ignoreUnknownETVhighlight) ||
					(isZeroETV && isHighlighted && !ignore0ETVhighlight),
				timestamp: new Date().toISOString(),
			});
		}

		// Clear both background properties first to ensure clean state
		notif.style.background = "";
		notif.style.backgroundColor = "";

		if (isZeroETV && isHighlighted && !ignore0ETVhighlight) {
			const color1 = zeroETVColor;
			const color2 = highlightColor;
			notif.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
			if (debugItemProcessing) {
				console.log("[DEBUG-ETV-STYLING] Applied Zero ETV + Highlight striped styling", {
					asin: notif.id?.replace("vh-notification-", ""),
				});
			}
		} else if (isUnknownETV && isHighlighted && !ignoreUnknownETVhighlight) {
			const color1 = unknownETVColor;
			const color2 = highlightColor;
			notif.style.background = `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
			if (debugItemProcessing) {
				console.log("[DEBUG-ETV-STYLING] Applied Unknown ETV + Highlight striped styling", {
					asin: notif.id?.replace("vh-notification-", ""),
				});
			}
		} else if (isHighlighted) {
			notif.style.backgroundColor = highlightColor;
			if (debugItemProcessing) {
				console.log("[DEBUG-ETV-STYLING] Applied Highlight solid color", {
					asin: notif.id?.replace("vh-notification-", ""),
				});
			}
		} else if (isZeroETV) {
			notif.style.backgroundColor = zeroETVColor;
			if (debugItemProcessing) {
				console.log("[DEBUG-ETV-STYLING] Applied Zero ETV solid color", {
					asin: notif.id?.replace("vh-notification-", ""),
				});
			}
		} else if (isUnknownETV) {
			notif.style.backgroundColor = unknownETVColor;
			if (debugItemProcessing) {
				console.log("[DEBUG-ETV-STYLING] Applied Unknown ETV solid color", {
					asin: notif.id?.replace("vh-notification-", ""),
				});
			}
		} else if (debugItemProcessing) {
			console.log("[DEBUG-ETV-STYLING] No styling applied", { asin: notif.id?.replace("vh-notification-", "") });
		}
	}

	_blurItemFound(notif) {
		if (!notif) {
			return false;
		}

		//Blur the thumbnail and title
		const img = notif.querySelector(".vh-img-container>img");
		if (img) {
			if (this._settings.get("general.unblurImageOnHover")) {
				img.classList.add("dynamic-blur");
			} else {
				img.classList.add("blur");
			}
		}
		notif.querySelector(".vvp-item-product-title-container>a")?.classList.add("dynamic-blur");
	}

	_formatETV(etv) {
		let formattedETV = "";
		if (etv != null) {
			formattedETV = new Intl.NumberFormat(this._i13nMgr.getLocale(), {
				style: "currency",
				currency: this._i13nMgr.getCurrency(),
			}).format(etv);
		}
		return formattedETV;
	}

	_formatDate(date = null) {
		if (date == null) {
			date = new Date();
		}
		if (date === "undefined") {
			return "N/A";
		}
		try {
			return new Intl.DateTimeFormat(this._i13nMgr.getLocale(), {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: !this._settings.get("notification.monitor.24hrsFormat"),
				hourCycle: "h23",
			}).format(date);
		} catch (err) {
			console.log("Date format invalid: " + date); // eslint-disable-line no-console
			return "N/A";
		}
	}

	_countVisibleItems() {
		return this._tileCounter.getCount();
	}

	/**
	 * Initialize event listeners for tab title updates
	 * This should be called after HookMgr is available
	 */
	_initializeTabTitleListener() {
		if (this._hookMgr) {
			// Listen to visibility count changes
			this._hookMgr.hookBind("nm-update-tab-title", (data) => {
				this._updateTabTitle();
			});
		}
	}

	async _updateTabTitle() {
		const visibleTilesCount = this._tileCounter.getCount();

		// Update the tab title
		document.title = "VHNM (" + visibleTilesCount + ")";

		// Debug logging for truncation issues
		const debugTabTitle = this._settings.get("general.debugTabTitle");
		if (debugTabTitle) {
			console.log(`[TabTitle] Updated to: ${visibleTilesCount}`, {
				providedCount: visibleTilesCount,
				timestamp: new Date().toISOString(),
			});
		}
	}

	// Helper method to preserve scroll position during DOM operations
	_preserveScrollPosition(callback) {
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

	_moveNotifToTop(notif) {
		const container = document.getElementById("vvp-items-grid");

		this._preserveScrollPosition(() => {
			//Find the first child that is not a placeholder tile
			let firstChild = container.firstChild;
			while (firstChild && firstChild.classList.contains("vh-placeholder-tile")) {
				firstChild = firstChild.nextSibling;
			}

			// Insert the notification at the top
			container.insertBefore(notif, firstChild);
		});
	}

	/**
	 * Get the TileCounter instance for testing purposes
	 * @returns {TileCounter} The TileCounter instance
	 */
	getTileCounter() {
		return this._tileCounter;
	}
}

export { MonitorCore };
