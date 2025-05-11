import { NotificationMonitor } from "./NotificationMonitor.js";

class NotificationMonitorV2 extends NotificationMonitor {
	#channel = null; //Broadcast channel for light mode

	constructor() {
		super();
		this.#channel = new BroadcastChannel("VineHelper");
		this._monitorV2 = true;
	}

	async initialize() {
		this._itemTemplateFile = "tile_lightview.html";

		// Wait for settings to load before proceeding
		await this._settings.waitForLoad();

		//Insert the header
		const parentContainer = document.querySelector("body");

		const prom2 = await this._tpl.loadFile("view/notification_monitor_header.html");
		this._tpl.setVar("fetchLimit", this._fetchLimit);
		const header = this._tpl.render(prom2, true);
		parentContainer.appendChild(header);

		// Update UI filters after header is inserted
		this._loadUIUserSettings();

		const itemContainer = document.createElement("div");
		itemContainer.id = "vvp-items-grid";
		parentContainer.appendChild(itemContainer);

		this._gridContainer = document.querySelector("#vvp-items-grid");

		//Monitor V2 does not run from an Amazon URL from which the country code is automatically detected,
		// so we need to set the country code manually
		this._i13nMgr.setCountryCode(this._settings.get("general.country"));
		document.getElementById("date_loaded").innerText = this._formatDate();
		this._mostRecentItemDateDOM = document.getElementById("date_most_recent_item");

		//Create the event listeners
		this._createListeners();

		this.#broadcastChannel();

		this._updateTabTitle();

		//Initial check of the status of services (service worker and WebSocket)
		this._serverComMgr.updateServicesStatus();
	}

	#broadcastChannel() {
		this.#channel.onmessage = (event) => {
			this._serverComMgr.processBroadcastMessage(event.data);
		};
	}
}

export { NotificationMonitorV2 };
