/*global chrome*/

import { broadcastFunction, dataStream as myStream, notificationPushFunction } from "./NewItemStreamProcessing.js";

class ServerCom {
	static #instance = null;

	_monitor = null;

	#serviceWorkerStatusTimer = null;
	#statusTimer = null;
	fetch100 = false;
	#dataBuffer = [];

	constructor(monitor) {
		this._monitor = monitor;

		if (ServerCom.#instance) {
			return ServerCom.#instance;
		}
		ServerCom.#instance = this;

		//Create a timer to check if the service worker is still running
		this.#serviceWorkerStatusTimer = window.setInterval(() => {
			this.#updateServiceWorkerStatus();
		}, 10000);

		this.#createEventListeners();

		// Bind the dataBuffering function to preserve this context
		broadcastFunction((data) => this.#dataBuffering(data));
		notificationPushFunction(this.#pushNotification);
	}

	#createEventListeners() {
		//For everyone but Safari
		this._monitor._channel.addEventListener("message", (event) => {
			this.processBroadcastMessage(event.data);
		});
	}

	/**
	 * Check the status of the service worker and the WebSocket connection.
	 * Called once upon loading the monitor V2 or V3.
	 */
	updateServicesStatus() {
		//Check the status of the service worker.
		this.#updateServiceWorkerStatus();

		//Obtain the status of the WebSocket connection.
		this._monitor._channel.postMessage({
			type: "wsStatus",
		});
	}

	async processBroadcastMessage(data) {
		if (data.type == undefined) {
			return false;
		}

		if (data.type == "masterMonitorPong") {
			window.clearTimeout(this.#statusTimer);
			this.#statusTimer = null;
			this.#setMasterMonitorStatus(true, "Running...");
		}
		if (data.type == "newETV") {
			this._monitor.setETVFromASIN(data.item.asin, data.item.etv);
		}
		if (data.type == "newTier") {
			this._monitor.setTierFromASIN(data.item.asin, data.item.tier);
		}
		if (data.type == "wsStatus" && data.status == "wsOpen") {
			this.#setWebSocketStatus(true);
		}
		if (data.type == "wsStatus" && data.status == "wsError") {
			this.#setWebSocketStatus(false, data.error);
		}
		if (data.type == "wsStatus" && data.status == "wsClosed") {
			this.#setWebSocketStatus(false);
		}

		if (data.type == "unavailableItem") {
			this._monitor.markItemUnavailable(data.item.asin);
		}

		if (data.type == "newPreprocessedItem") {
			myStream.input({
				index: 0,
				type: "newItem",
				domain: this._monitor._settings.get("general.country"),
				date: data.item.date,
				date_added: data.item.date_added,
				asin: data.item.asin,
				title: data.item.title,
				//search: data.item.search,
				img_url: data.item.img_url,
				etv_min: data.item.etv_min, //null
				etv_max: data.item.etv_max, //null
				reason: data.item.reason,
				queue: data.item.queue,
				tier: data.item.tier,
				is_parent_asin: data.item.is_parent_asin,
				enrollment_guid: data.item.enrollment_guid,
			});
		}

		if (data.type == "newItem") {
			await this._monitor.addTileInGrid(data);
		}

		if (data.type == "last100") {
			this.#processLast100Items(data.products);
		}
		if (data.type == "fetch100") {
			console.log("Fetch last received.");
			for (const item of JSON.parse(data.data)) {
				if (item.type == "newItem") {
					await this._monitor.addTileInGrid(item);
				} else if (item.type == "fetchRecentItemsEnd") {
					this._monitor.fetchRecentItemsEnd();
				}
			}
		}
		if (data.type == "newVariants") {
			this._monitor.addVariants(data.item);
		}
		if (data.type == "fetchAutoLoadUrl") {
			const queue = data.queue;
			const page = data.page;

			const queueTable = { AI: "encore", AFA: "last_chance", RFY: "potluck" };
			const url = `https://www.amazon.${this._monitor._i13nMgr.getDomainTLD()}/vine/vine-items?queue=${queueTable[queue]}&page=${page}#AR`;
			console.log(`${new Date().toLocaleString()} - Reloading page: ${queue} page ${page}`);
			this._monitor.fetchAutoLoadUrl(url, queue, page);
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
		if (!this._monitor._settings.get("notification.active")) {
			this.#setMasterMonitorStatus(
				false,
				"You need to enable the notifications in VineHelper's plugin settings, under the 'Notifications' tab."
			);
		} else if (this._monitor._i13nMgr.getCountryCode() === null) {
			this.#setMasterMonitorStatus(false, "Your country has not been detected, load a vine page first.");
		} else if (this._monitor._i13nMgr.getDomainTLD() === null) {
			this.#setMasterMonitorStatus(
				false,
				"No valid country found. You current country is detected as: '" +
					this._monitor._i13nMgr.getCountryCode() +
					"', which is not currently supported by Vine Helper. Reach out so we can add it!"
			);
		} else if (this._monitor._settings.get("notification.active")) {
			//Send a message to the service worker to check if it is still running
			this.#statusTimer = window.setTimeout(() => {
				this.#setMasterMonitorStatus(false, "Not responding, reload the page.");
			}, 500);
			try {
				this._monitor._channel.postMessage({ type: "masterMonitorPing" });
				if (this._monitor._isMasterMonitor) {
					clearTimeout(this.#statusTimer);
					this.#statusTimer = null;
					this.#setMasterMonitorStatus(true, "Running as master ...");
				}
			} catch (e) {
				//Page out of context, let the display show an error.
			}
		}
	}

	#setMasterMonitorStatus(status, desc = "") {
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

	//#####################################################
	//## ITEM PROCESSING FUNCTIONS
	//#####################################################

	#dataBuffering(data) {
		if (!this.fetch100) {
			this._monitor._channel.postMessage(data);
			this.processBroadcastMessage(data);
			return;
		}
		this.#dataBuffer.push(data);
		if (data.type == "fetchRecentItemsEnd") {
			this._monitor._channel.postMessage({ type: "fetch100", data: JSON.stringify(this.#dataBuffer) });
			this.processBroadcastMessage({ type: "fetch100", data: JSON.stringify(this.#dataBuffer) });
			this.#dataBuffer = [];
			this.fetch100 = false;
		}
	}

	async #processLast100Items(arrProducts) {
		arrProducts.sort((a, b) => {
			const dateA = new Date(a.date);
			const dateB = new Date(b.date);
			return dateB - dateA;
		});
		this.fetch100 = true;
		for (let i = arrProducts.length - 1; i >= 0; i--) {
			const {
				title,
				date,
				date_added,
				timestamp,
				asin,
				img_url,
				etv_min,
				etv_max,
				queue,
				tier,
				is_parent_asin,
				enrollment_guid,
				unavailable,
				variants,
			} = arrProducts[i];

			//Only display notification for products with a title and image url
			//And that are more recent than the latest notification received.
			if (img_url == "" || title == "") {
				console.log("FETCH LATEST: item without title or image url: " + asin);
				continue;
			}

			myStream.input({
				index: i,
				type: "newItem",
				domain: this._monitor._settings.get("general.country"),
				date: date,
				date_added: date_added,
				asin: asin,
				title: title,
				img_url: img_url,
				etv_min: etv_min,
				etv_max: etv_max,
				queue: queue,
				tier: tier,
				reason: "Fetch latest new items",
				is_parent_asin: is_parent_asin,
				enrollment_guid: enrollment_guid,
				unavailable: unavailable,
				variants: variants,
			});
		}
		myStream.input({ type: "fetchRecentItemsEnd" });
	}

	//#####################################################
	//## PUSH NOTIFICATIONS
	//#####################################################

	#pushNotification(asin, queue, is_parent_asin, enrollment_guid, search_string, title, description, img_url) {
		console.log(
			"pushNotification",
			asin,
			queue,
			is_parent_asin,
			enrollment_guid,
			search_string,
			title,
			description,
			img_url
		);
		chrome.runtime.sendMessage({
			type: "pushNotification",
			asin: asin,
			queue: queue,
			is_parent_asin: is_parent_asin,
			enrollment_guid: enrollment_guid,
			search_string: search_string,
			title: title,
			description: description,
			img_url: img_url,
		});
	}
}

export { ServerCom };
