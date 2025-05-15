//This file serve the main purpose of reducing the size of the NotificationMonitor.js file.
//It:
// - contain the variables specific to V2 or V3
// - instanciate the specific classes for V2 or V3
// - instanciate the general purpose classes
// - contains some basic functions that are used by the NotificationMonitor that where good to get out of the way.

import { SettingsMgr } from "../SettingsMgr.js";
import { Template } from "../Template.js";
import { Environment } from "../Environment.js";
import { Logger } from "../Logger.js";

import { PinMgr } from "./PinMgr.js";
import { Internationalization } from "../Internationalization.js";
import { ScreenNotifier, ScreenNotification } from "../ScreenNotifier.js";
import { Tooltip } from "../Tooltip.js";
import { BrendaAnnounceQueue } from "../BrendaAnnounce.js";
import { ModalMgr } from "../ModalMgr.js";
import { NotificationsSoundPlayer } from "../NotificationsSoundPlayer.js";
import { ServerCom } from "./ServerCom.js";
import { ItemsMgr } from "./ItemsMgr.js";

class MonitorCore {
	//Variables linked to monitor V2 vs V3
	_monitorV2 = false; //True if the monitor is in V2 mode
	_monitorV3 = false; //True if the monitor is in V3 mode
	_tileSizer = null; //The tile sizer tool for v3 monitor
	_tierMgr = null; //The tier manager object

	_fetchLimit = 100; //The fetch limit for the monitor

	constructor() {
		// Prevent direct instantiation of the abstract class
		if (this.constructor === MonitorCore) {
			throw new TypeError('Abstract class "MonitorLib" cannot be instantiated directly.');
		}

		//General purpose classes
		this._settings = new SettingsMgr();
		this._env = new Environment();
		this._tpl = new Template();
		this._log = new Logger();
		this._i13nMgr = new Internationalization();
		this._notificationsMgr = new ScreenNotifier();
		this._tooltipMgr = new Tooltip();
		this._brendaMgr = new BrendaAnnounceQueue();
		this._dialogMgr = new ModalMgr();
		this._soundPlayerMgr = new NotificationsSoundPlayer();

		this._env.data.gridDOM.regular = document.getElementById("vvp-items-grid");

		//Notification Monitor's specific classes
		this._serverComMgr = new ServerCom();
		this._serverComMgr.setMarkUnavailableCallback(this.markItemUnavailable.bind(this));
		this._serverComMgr.setAddTileInGridCallback(this.addTileInGrid.bind(this));
		this._serverComMgr.setFetchRecentItemsEndCallback(this.fetchRecentItemsEnd.bind(this));
		this._serverComMgr.setSetETVFromASINCallback(this.setETVFromASIN.bind(this));
		this._serverComMgr.setSetTierFromASINCallback(this.setTierFromASIN.bind(this));
		this._serverComMgr.setAddVariantCallback(this.addVariants.bind(this));

		this._itemsMgr = new ItemsMgr(this._settings);

		this._pinMgr = new PinMgr();
		this._pinMgr.setGetItemDOMElementCallback(this._itemsMgr.getItemDOMElement.bind(this._itemsMgr));

		this.#getFetchLimit();
	}

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

	_processNotificationHighlight(notif) {
		if (!notif) {
			return false;
		}

		const etvObj = notif.querySelector("div.etv");
		if (!etvObj) {
			return false;
		}

		const isHighlighted =
			notif.dataset.typeHighlight == 1 && this._settings.get("notification.monitor.highlight.colorActive");
		const isZeroETV =
			notif.dataset.typeZeroETV == 1 && this._settings.get("notification.monitor.zeroETV.colorActive");
		const isUnknownETV =
			etvObj.dataset.etvMax == "" && this._settings.get("notification.monitor.unknownETV.colorActive");

		const highlightColor = this._settings.get("notification.monitor.highlight.color");
		const zeroETVColor = this._settings.get("notification.monitor.zeroETV.color");
		const unknownETVColor = this._settings.get("notification.monitor.unknownETV.color");

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

	_blurItemFound(notif) {
		if (!notif) {
			return false;
		}

		//Blur the thumbnail and title
		notif.querySelector(".vh-img-container>img")?.classList.add("blur");
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
		return new Intl.DateTimeFormat(this._i13nMgr.getLocale(), {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: !this._settings.get("notification.monitor.24hrsFormat"),
			hourCycle: "h23",
		}).format(date);
	}

	_updateTabTitle() {
		// Count visible items based on current filters
		let visibleCount = 0;

		// Loop through all items
		for (const [asin, item] of this._itemsMgr.items.entries()) {
			// Skip items without DOM elements
			if (!item.element) continue;

			// Skip items hidden by style
			if (window.getComputedStyle(item.element).display === "none") continue;

			visibleCount++;
		}

		// Update the tab title
		document.title = "VHNM (" + visibleCount + ")";
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
			// Insert the notification at the top
			container.insertBefore(notif, container.firstChild);
		});
	}
}

export { MonitorCore };
