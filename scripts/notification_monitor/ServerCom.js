import { SettingsMgr } from "../SettingsMgr.js";
const Settings = new SettingsMgr();

import { Internationalization } from "../Internationalization.js";
const i13n = new Internationalization();

class ServerCom {
	#serviceWorkerStatusTimer = null;
	#statusTimer = null;

	markUnavailableCallback = null;
	addTileInGridCallback = null;
	fetchRecentItemsEndCallback = null;
	setETVFromASINCallback = null;
	setTierFromASINCallback = null;
	addVariantCallback = null;

	constructor() {
		//Message from within the context of the extension
		//Messages sent via: chrome.tabs.sendMessage(tab.id, data);
		//In this case, all messages are coming from the service_worker file.
		chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
			this.processBroadcastMessage(message);
		});

		//Create a timer to check if the service worker is still running
		this.#serviceWorkerStatusTimer = window.setInterval(() => {
			this.#updateServiceWorkerStatus();
		}, 10000);
	}

	setMarkUnavailableCallback(callback) {
		this.markUnavailableCallback = callback;
	}

	setAddTileInGridCallback(callback) {
		this.addTileInGridCallback = callback;
	}

	setFetchRecentItemsEndCallback(callback) {
		this.fetchRecentItemsEndCallback = callback;
	}

	setSetETVFromASINCallback(callback) {
		this.setETVFromASINCallback = callback;
	}

	setSetTierFromASINCallback(callback) {
		this.setTierFromASINCallback = callback;
	}

	setAddVariantCallback(callback) {
		this.addVariantCallback = callback;
	}

	/**
	 * Check the status of the service worker and the WebSocket connection.
	 */
	updateServicesStatus() {
		//Check the status of the service worker.
		this.#updateServiceWorkerStatus();

		//Obtain the status of the WebSocket connection.
		chrome.runtime.sendMessage({
			type: "wsStatus",
		});
	}

	async processBroadcastMessage(data) {
		if (data.type == undefined) {
			return false;
		}

		if (data.type == "pong") {
			window.clearTimeout(this.#statusTimer);
			this.#setServiceWorkerStatus(true, "Running...");
		}
		if (data.type == "newETV") {
			this.setETVFromASINCallback(data.asin, data.etv);
		}
		if (data.type == "newTier") {
			this.setTierFromASINCallback(data.asin, data.tier);
		}
		if (data.type == "wsOpen") {
			this.#setWebSocketStatus(true);
		}
		if (data.type == "wsError") {
			this.#setWebSocketStatus(false, data.error);
		}
		if (data.type == "wsClosed") {
			this.#setWebSocketStatus(false);
		}

		if (data.type == "unavailableItem") {
			this.markUnavailableCallback(data.asin);
		}
		if (data.type == "newItem") {
			await this.addTileInGridCallback(data);
		}
		if (data.type == "fetch100") {
			for (const item of data.data) {
				if (item.type == "newItem") {
					await this.addTileInGridCallback(item);
				} else if (item.type == "fetchRecentItemsEnd") {
					this.fetchRecentItemsEndCallback();
				}
			}
		}
		if (data.type == "newVariants") {
			this.addVariantCallback(data);
		}
	}

	#setWebSocketStatus(status, message = null) {
		const icon = document.querySelector("#statusWS div.vh-switch-32");
		const description = document.querySelector("#descriptionWS");
		if (status) {
			icon.classList.remove("vh-icon-switch-off");
			icon.classList.add("vh-icon-switch-on");
			description.innerText = "Listening...";
			this._wsErrorMessage = null;
		} else {
			icon.classList.remove("vh-icon-switch-on");
			icon.classList.add("vh-icon-switch-off");
			if (message) {
				this._wsErrorMessage = message;
				description.innerText = message;
			} else if (this._wsErrorMessage == null) {
				description.innerText = "Not connected. Retrying in <30 sec...";
			}
		}
	}

	#updateServiceWorkerStatus() {
		if (!Settings.get("notification.active")) {
			this.#setServiceWorkerStatus(
				false,
				"You need to enable the notifications in VineHelper's plugin settings, under the 'Notifications' tab."
			);
		} else if (i13n.getCountryCode() === null) {
			this.#setServiceWorkerStatus(false, "Your country has not been detected, load a vine page first.");
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
}

export { ServerCom };
