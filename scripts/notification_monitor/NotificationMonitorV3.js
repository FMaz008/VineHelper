import { NotificationMonitor } from "./NotificationMonitor.js";

import { TileSizer } from "../TileSizer.js";
import { TierMgr } from "./TierMgr.js";

class NotificationMonitorV3 extends NotificationMonitor {
	constructor() {
		super();
		this._monitorV3 = true;
		this._tileSizer = new TileSizer("notification.monitor.tileSize");
		this._tierMgr = new TierMgr(this._env);
	}

	async initialize() {
		// Wait for settings to load before proceeding
		await this._settings.waitForLoad();

		if (this._settings.get("notification.monitor.listView")) {
			this._itemTemplateFile = "tile_listview.html";
		} else {
			this._itemTemplateFile = "tile_gridview.html";
		}

		//Check if the user is in vine jail:
		if (document.querySelector("#vvp-under-review-alert")) {
			alert("You are in vine jail. Please get your account in good standing in order to access this feature.");
			return false;
		}

		//Remove the existing items.
		this._gridContainer = document.querySelector("#vvp-items-grid");
		this._gridContainer.innerHTML = "";

		//Check if the user is a gold tier user
		this._tierMgr.readTierInfo();

		//Remove the item count
		this._hideSelector("#vvp-items-grid-container>p");

		//Remove the navigation
		this._hideSelector("#vvp-items-grid-container > div[role=navigation]");

		//Remove the categories
		this._hideSelector("#vvp-browse-nodes-container");

		//Desktop header/footer
		this._hideSelector("#vvp-header, #navFooter, ul.a-tabs");

		//Mobile header/footer
		this._hideSelector("header, footer");

		//Remove the search bar
		this._hideSelector(".vvp-items-button-and-search-container");

		//Remove the carousel/suggested items
		this._hideSelector("#rhf");

		//Remove the header add-ons
		this._hideSelector(".amzn-ss-wrap");

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

		//Set the grid items size
		if (this._settings.get("general.tileSize.enabled")) {
			const width = this._settings.get("notification.monitor.tileSize.width");
			const grid = document.querySelector("#vvp-items-grid");
			grid.classList.add("vh-notification-monitor");
			grid.style.gridTemplateColumns = `repeat(auto-fill,minmax(${width}px,auto))`;
		}

		this._updateTabTitle();

		//Insert the header
		const parentContainer = document.querySelector("div.vvp-tab-content");
		const mainContainer = document.querySelector("div.vvp-items-container");
		const topContainer = document.querySelector("div#vvp-items-grid-container");
		const itemContainer = document.querySelector("div#vvp-items-grid");

		let prom2 = await this._tpl.loadFile("view/notification_monitor_header.html");
		this._tpl.setVar("fetchLimit", this._fetchLimit);
		this._tpl.setIf("TIER3", this._settings.isPremiumUser(3));
		this._tpl.setIf("TIER2", this._settings.isPremiumUser(2));
		this._tpl.setIf("TIER1", this._settings.isPremiumUser(1));
		const header = this._tpl.render(prom2, true);
		parentContainer.insertBefore(header, mainContainer);

		// Update UI filters after header is inserted
		this._loadUIUserSettings();

		//Insert the VH tab container for the items even if there is no tabs
		const tabContainer = document.createElement("div");
		tabContainer.id = "vh-tabs";
		itemContainer.classList.add("tab-grid");

		if (
			this._settings.get("thorvarium.mobileios") ||
			this._settings.get("thorvarium.mobileandroid") ||
			this._settings.get("thorvarium.smallItems")
		) {
			tabContainer.classList.add("smallitems");
		}

		//Assign the tab to the top container
		topContainer.appendChild(tabContainer);

		//Assign the item container to the tab container
		tabContainer.appendChild(itemContainer);

		if (this._settings.get("notification.monitor.listView")) {
			this._gridContainer.classList.add("listview");
		}

		//Display tile size widget if the list view is not active and the tile size is active
		if (this._settings.get("general.tileSize.active") && !this._settings.get("notification.monitor.listView")) {
			this.#initTileSizeWidget();
		}

		document.getElementById("date_loaded").innerText = this._formatDate();
		this._mostRecentItemDateDOM = document.getElementById("date_most_recent_item");

		if (!this._env.isFirefox() && this._settings.get("notification.monitor.openLinksInNewTab") != "1") {
			if (this._settings.get("notification.monitor.preventUnload")) {
				this.#preventRedirections();
			}
		}

		//Create the event listeners
		this._createListeners();

		//Change the tab's favicon
		this._updateTabFavicon();

		//Update the user tier info
		this._updateUserTierInfo();

		//Initial check of the status of services (service worker and WebSocket)
		this._serverComMgr.updateServicesStatus();
	}

	async #initTileSizeWidget() {
		if (this._settings.get("notification.monitor.listView")) {
			return;
		}
		const container = document.querySelector("#vvp-items-grid-container");
		if (container) {
			if (this._settings.get("general.tileSize.enabled")) {
				//Inject the GUI for the tile sizer widget
				this._tileSizer.injectGUI(container);
			}
		}
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
}

export { NotificationMonitorV3 };
