//This file serve the main purpose of reducing the size of the NotificationMonitor.js file.
//It contains some basic functions that are used by the NotificationMonitor.

import { SettingsMgr } from "../SettingsMgr.js";
const Settings = new SettingsMgr();

import { Environment } from "../Environment.js";
var env = new Environment();

import { Pin } from "./Pin.js";
import { Internationalization } from "../Internationalization.js";
import { ScreenNotifier, ScreenNotification } from "../ScreenNotifier.js";
import { Tooltip } from "../Tooltip.js";
import { BrendaAnnounceQueue } from "../BrendaAnnounce.js";
import { ModalMgr } from "../ModalMgr.js";
import { NotificationsSoundPlayer } from "../NotificationsSoundPlayer.js";
import { ServerCom } from "./ServerCom.js";

class MonitorCore {
	constructor() {
		// Prevent direct instantiation of the abstract class
		if (this.constructor === MonitorCore) {
			throw new TypeError('Abstract class "MonitorLib" cannot be instantiated directly.');
		}

		this._i13nMgr = new Internationalization();
		this._pinMgr = new Pin();
		this._pinMgr.setGetItemDOMElementCallback(this.getItemDOMElement.bind(this));
		this._notificationsMgr = new ScreenNotifier();
		this._tooltipMgr = new Tooltip();
		this._brendaMgr = new BrendaAnnounceQueue();
		this._dialogMgr = new ModalMgr();
		this._soundPlayerMgr = new NotificationsSoundPlayer();
		this._serverComMgr = new ServerCom();
		this._serverComMgr.setMarkUnavailableCallback(this.markItemUnavailable.bind(this));
		this._serverComMgr.setAddTileInGridCallback(this.addTileInGrid.bind(this));
		this._serverComMgr.setFetchRecentItemsEndCallback(this.fetchRecentItemsEnd.bind(this));
	}

	_currentDateTime() {
		return new Date();
	}

	async _getFetchLimit() {
		await Settings.waitForLoad();

		//Define the fetch limit based on the user's tier
		if (Settings.isPremiumUser(3)) {
			return 300;
		} else if (Settings.isPremiumUser(2)) {
			return 200;
		} else {
			return 100;
		}
	}

	_displayToasterNotification(data) {
		this._notificationsMgr.pushNotification(new ScreenNotification(data));
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

	#send_report(asin) {
		let manifest = chrome.runtime.getManifest();

		const content = {
			api_version: 5,
			app_version: manifest.version,
			country: this._i13nMgr.getCountryCode(),
			action: "report_asin",
			uuid: Settings.get("general.uuid", false),
			asin: asin,
		};
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};

		//Send the report to VH's server
		fetch(env.getAPIUrl(), options).then(function () {
			alert("Report sent. Thank you.");
		});
	}

	_handleReportClick(e) {
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
		} else {
			alert("Not reported.");
		}
	}

	async markItemUnavailable(asin) {
		if (this._items.has(asin)) {
			const item = this._items.get(asin);
			item.data.unavailable = true;
			this._items.set(asin, item);
		}
	}
}

export { MonitorCore };
