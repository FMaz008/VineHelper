/*global chrome*/

import { NotificationMonitor } from "/scripts/notifications-monitor/core/NotificationMonitor.js";

import { TileSizer } from "/scripts/ui/controllers/TileSizer.js";
import { TierMgr } from "/scripts/notifications-monitor/services/TierMgr.js";
import { NoShiftGrid } from "/scripts/notifications-monitor/services/NoShiftGrid.js";
import { ErrorAlertManager } from "/scripts/notifications-monitor/services/ErrorAlertManager.js";
import { GridEventManager } from "/scripts/notifications-monitor/services/GridEventManager.js";
import { VisibilityStateManager } from "/scripts/notifications-monitor/services/VisibilityStateManager.js";
import { DIContainer } from "/scripts/infrastructure/DIContainer.js";

class NotificationMonitorV3 extends NotificationMonitor {
	#container;

	constructor() {
		super(true);
		this._monitorV3 = true;

		// Initialize DI container for this component
		// This demonstrates how we can gradually migrate to DI
		this.#container = new DIContainer();
		this.#registerServices();

		// Existing services still use direct instantiation (for now)
		this._tileSizer = new TileSizer("notification.monitor.tileSize");
		this._tierMgr = new TierMgr(this._env);

		// New service uses DI
		this._errorAlertManager = this.#container.resolve("errorAlertManager");

		// Initialize VisibilityStateManager
		this._visibilityStateManager = this.#container.resolve("visibilityStateManager");
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

		// Register VisibilityStateManager as a singleton
		// Manages visible items count with incremental updates
		this.#container.register("visibilityStateManager", (hookMgr) => new VisibilityStateManager(hookMgr), {
			singleton: true,
			dependencies: ["hookMgr"],
		});

		// Register GridEventManager with its dependencies
		// This demonstrates proper DI with dependency injection
		this.#container.register(
			"gridEventManager",
			(hookMgr, noShiftGrid, monitor, visibilityStateManager) =>
				new GridEventManager(hookMgr, noShiftGrid, monitor, visibilityStateManager),
			{
				singleton: true,
				dependencies: ["hookMgr", "noShiftGrid", "monitor", "visibilityStateManager"],
			}
		);

		// Register dependencies that GridEventManager needs
		// These are registered as factories (not singletons) since they're provided externally
		this.#container.register("hookMgr", () => this._hookMgr);
		this.#container.register("noShiftGrid", () => this._noShiftGrid);
		this.#container.register("monitor", () => this);

		// Future services can be registered here as we migrate them
		// Example for when TileSizer is migrated:
		// this.#container.register('tileSizer', () => new TileSizer("notification.monitor.tileSize"), {
		//     singleton: true
		// });
	}

	async initialize() {
		// Wait for settings to load before proceeding
		await this._settings.waitForLoad();

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
		this._gridContainer.innerHTML = "";

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

		// Initialize the VisibilityStateManager with the current count
		// This ensures placeholders show correctly on initial load
		const initialCount = this._countVisibleItems();
		if (this._visibilityStateManager && initialCount > 0) {
			this._visibilityStateManager.setCount(initialCount);
		}

		// Initialize event-driven tab title updates
		this._initializeTabTitleListener();

		//Insert the header
		const parentContainer = document.querySelector("div.vvp-tab-content");
		const mainContainer = document.querySelector("div.vvp-items-container");
		const topContainer = document.querySelector("div#vvp-items-grid-container");
		const itemContainer = document.querySelector("div#vvp-items-grid");

		let prom2 = await this._tpl.loadFile("scripts/ui/templates/notification_monitor_header.html");
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

		// Initialize the error alert manager
		this._errorAlertManager.initialize();

		if (
			this._settings.get("notification.monitor.placeholders") &&
			!this._settings.get("notification.monitor.listView") &&
			this._settings.get("general.tileSize.enabled")
		) {
			this._noShiftGrid = new NoShiftGrid(this, this._visibilityStateManager);

			// Update the dependency registrations with the actual instances
			this.#container.register("noShiftGrid", () => this._noShiftGrid);

			// Use DI container to resolve GridEventManager with its dependencies
			this._gridEventManager = this.#container.resolve("gridEventManager");

			// Insert initial placeholders after DOM is ready and grid has width
			// Use setTimeout to ensure the grid container has been rendered and has width
			setTimeout(() => {
				if (this._noShiftGrid && this._gridContainer && this._gridContainer.offsetWidth > 0) {
					// Emit event instead of direct call
					this._hookMgr.hookExecute("grid:initialized");
				}
			}, 100);
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
		window.addEventListener(
			"beforeunload",
			(event) => {
				this._hookMgr.hookExecute("beforeunload");
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

	/**
	 * Update the tab title with the current visible items count
	 * @override
	 */
	_updateTabTitle() {
		// Get the current visible items count from VisibilityStateManager
		const itemsCount = this._visibilityStateManager ? this._visibilityStateManager.getCount() : 0;

		// Update the tab title to match parent implementation
		document.title = "VHNM (" + itemsCount + ")";
	}
}

export { NotificationMonitorV3 };
