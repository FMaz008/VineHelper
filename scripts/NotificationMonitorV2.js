import { NotificationMonitor } from "./NotificationMonitor.js";

import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();

import { Template } from "./Template.js";
var Tpl = new Template();

import { Internationalization } from "./Internationalization.js";
var i13n = new Internationalization();

class NotificationMonitorV2 extends NotificationMonitor {
	constructor() {
		super();
	}

	async initialize() {
		this._lightMode = true;
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

		//Create the event listeners
		this._createEventListeners();

		//Obtain the status of the WebSocket connection.
		chrome.runtime.sendMessage({
			type: "wsStatus",
		});

		i13n.setCountryCode(Settings.get("general.country"));
		document.getElementById("date_loaded").innerText = this._formatDate();
		this._mostRecentItemDateDOM = document.getElementById("date_most_recent_item");

		this._listeners();

		this.#broadcastChannel();

		this._updateTabTitle();
	}

	#broadcastChannel() {
		this._channel.onmessage = (event) => {
			this._processBroadcastMessage(event.data);
		};
		this._updateServiceWorkerStatus();
		this._channel.postMessage({ type: "wsStatus" });
	}
}

export { NotificationMonitorV2 };
