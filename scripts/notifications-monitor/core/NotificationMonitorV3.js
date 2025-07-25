/*global chrome*/

import { NotificationMonitor } from "/scripts/notifications-monitor/core/NotificationMonitor.js";

import { TileSizer } from "/scripts/ui/controllers/TileSizer.js";
import { TierMgr } from "/scripts/notifications-monitor/services/TierMgr.js";
class NotificationMonitorV3 extends NotificationMonitor {
	constructor() {
		super(true);
		this._monitorV3 = true;

		// Existing services still use direct instantiation (for now)
		this._tileSizer = new TileSizer("notification.monitor.tileSize");
		this._tierMgr = new TierMgr(this._env);
	}

	async initialize() {
		// Wait for settings to load before proceeding
		await this._settings.waitForLoad();

		const debugInit = this._settings.get("general.debugTabTitle");
		if (debugInit) {
			console.log("[NotificationMonitorV3] Starting initialization...");
			console.log("[NotificationMonitorV3] Settings loaded");
		}
		// Keywords are now pre-compiled when saved in settings

		if (this._settings.get("notification.monitor.listView")) {
			this._itemTemplateFile = "tile_listview.html";
		} else {
			this._itemTemplateFile = "tile_gridview.html";
		}

		document.querySelector("body").style.setProperty("padding-right", "0px", "important");

		//Check if the user is in vine jail:
		if (document.querySelector("#vvp-under-review-alert")) {
			alert("You are in vine jail. Please get your account in good standing in order to access this feature.");
			return false;
		}

		//Remove the existing items.
		this._gridContainer = document.querySelector("#vvp-items-grid");
		// Use proper cleanup instead of innerHTML = "" to prevent memory leaks
		this._clearGridContainer();

		//Check if the user is a gold tier user
		this._tierMgr.readTierInfo();

		//Remove the item count
		this._hideSelector("#vvp-items-grid-container>p");

		//Remove the navigation
		this._hideSelector("#vvp-items-grid-container > div[role=navigation]");

		//Remove the pagination:
		this._hideSelector("#vvp-items-grid-container > nav");

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
			if (!elem.matches('script[data-a-state=\'{"key":"vvp-context"}\']')) {
				elem.remove();
			}
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

		// Initialize event-driven tab title updates
		this._initializeTabTitleListener();

		//Insert the header
		const parentContainer = document.querySelector("div.vvp-tab-content");
		const mainContainer = document.querySelector("div.vvp-items-container");
		const topContainer = document.querySelector("div#vvp-items-grid-container");
		const itemContainer = document.querySelector("div#vvp-items-grid");

		try {
			let prom2 = await this._tpl.loadFile("scripts/ui/templates/notification_monitor_header.html");
			this._tpl.setVar("fetchLimit", this._fetchLimit);
			this._tpl.setIf("TIER3", this._settings.isPremiumUser(3));
			this._tpl.setIf("TIER2", this._settings.isPremiumUser(2));
			this._tpl.setIf("TIER1", this._settings.isPremiumUser(1));
			const header = this._tpl.render(prom2, true);
			parentContainer.insertBefore(header, mainContainer);
		} catch (error) {
			console.error("Failed to load notification monitor header:", error);
			// Show error message to user
			const errorDiv = document.createElement("div");
			errorDiv.className = "vh-error-message";
			errorDiv.style.cssText =
				"background: #ff4444; color: white; padding: 10px; margin: 10px 0; border-radius: 5px;";
			errorDiv.innerHTML = `
				<strong>Error: Failed to load notification monitor header</strong><br>
				Please try the following:<br>
				1. Open VineHelper Settings (this reloads all templates)<br>
				2. Reload this page<br>
				If the problem persists, please report this issue.
			`;
			parentContainer.insertBefore(errorDiv, mainContainer);

			// Throw error to prevent further initialization with broken state
			throw new Error("Critical template loading failure - cannot continue initialization");
		}

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

		const dateLoadedElement = document.getElementById("date_loaded");
		if (dateLoadedElement) {
			dateLoadedElement.innerText = this._formatDate();
		}
		this._mostRecentItemDateDOM = document.getElementById("date_most_recent_item");
		if (!this._mostRecentItemDateDOM) {
			console.error("date_most_recent_item element not found in DOM");
		}

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

		//Initial check of the status of services (master monitor and WebSocket)
		this._serverComMgr.updateServicesStatus();
		if (debugInit) {
			console.log("[NotificationMonitorV3] Services status updated");
		}

		// Initialize the error alert manager
		this._errorAlertManager.initialize();
		if (debugInit) {
			console.log("[NotificationMonitorV3] Error alert manager initialized");
			console.log("[NotificationMonitorV3] Is Master Monitor:", this._isMasterMonitor);
		}
	}

	async #initTileSizeWidget() {
		if (this._settings.get("notification.monitor.listView")) {
			return;
		}
		const container = document.querySelector("#vh-nm-tile-size-container");
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
		this._beforeUnloadHandler = (event) => {
			this._hookMgr.hookExecute("beforeunload");
			event.stopPropagation();
			event.preventDefault();
			event.returnValue = "";

			console.log("Page unload prevented");
			return false;
		};
		window.addEventListener("beforeunload", this._beforeUnloadHandler, true);

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

	/**
	 * Clean up all event listeners and references
	 * @override
	 */
	destroy() {
		console.log("🧹 Destroying NotificationMonitorV3...");

		// Remove V3-specific beforeunload listener
		if (this._beforeUnloadHandler) {
			window.removeEventListener("beforeunload", this._beforeUnloadHandler, true);
			this._beforeUnloadHandler = null;
		}

		// Call parent destroy to clean up all inherited event listeners
		super.destroy();

		console.log("✅ NotificationMonitorV3 cleanup complete");
	}
}

export { NotificationMonitorV3 };
