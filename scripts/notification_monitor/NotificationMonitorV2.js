import { NotificationMonitor } from "./NotificationMonitor.js";

import { SettingsMgr } from "../SettingsMgr.js";
const Settings = new SettingsMgr();

import { Template } from "../Template.js";
var Tpl = new Template();

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
		await Settings.waitForLoad();

		//Insert the header
		const parentContainer = document.querySelector("body");

		const prom2 = await Tpl.loadFile("view/notification_monitor_header.html");
		Tpl.setVar("fetchLimit", this._fetchLimit);
		const header = Tpl.render(prom2, true);
		parentContainer.appendChild(header);

		// Update UI filters after header is inserted
		this._loadUIUserSettings();

		const itemContainer = document.createElement("div");
		itemContainer.id = "vvp-items-grid";
		parentContainer.appendChild(itemContainer);

		this._gridContainer = document.querySelector("#vvp-items-grid");

		this._i13nMgr.setCountryCode(Settings.get("general.country"));
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
