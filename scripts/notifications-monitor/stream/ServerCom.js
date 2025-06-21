/*global chrome*/

import {
	broadcastFunction,
	dataStream as myStream,
	notificationPushFunction,
} from "/scripts/notifications-monitor/stream/NewItemStreamProcessing.js";
import { Item } from "/scripts/core/models/Item.js";
class ServerCom {
	static #instance = null;

	_monitor = null;

	#serviceWorkerStatusTimer = null;
	#statusTimer = null;
	#channelMessageHandler = null;
	fetch100 = false;
	#dataBuffer = [];

	constructor(monitor) {
		this._monitor = monitor;

		if (ServerCom.#instance) {
			return ServerCom.#instance;
		}
		ServerCom.#instance = this;

		//Create a timer to check if the master monitor is still running
		this.#serviceWorkerStatusTimer = window.setInterval(() => {
			this.#updateMasterMonitorStatus();
		}, 10000);

		this.#createEventListeners();

		// Bind the dataBuffering function to preserve this context
		broadcastFunction((data) => this.#dataBuffering(data));
		notificationPushFunction(this.#pushNotification);
	}

	/**
	 * Helper method to safely create and validate Item instances
	 * @param {Object} data - The data to create the Item from
	 * @param {string} context - Context for error logging
	 * @returns {Item|null} Valid Item instance or null if invalid
	 */
	#createValidatedItem(data, context) {
		if (!data) {
			console.error(`[ServerCom] ${context}: No data provided`);
			return null;
		}

		try {
			const item = new Item(data);
			return item;
		} catch (error) {
			// Item constructor already logs the specific error with data
			console.error(`[ServerCom] ${context}: ${error.message}`);
			return null;
		}
	}

	#createEventListeners() {
		//For everyone but Safari
		this.#channelMessageHandler = (event) => {
			this.processBroadcastMessage(event.data);
		};
		this._monitor._channel.addEventListener("message", this.#channelMessageHandler);
	}

	/**
	 * Check the status of the master monitor and the WebSocket connection.
	 * Called once upon loading the monitor V2 or V3, and when the master monitor is promoted.
	 */
	updateServicesStatus() {
		//Check the status of the master monitor.
		this.#updateMasterMonitorStatus();

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
			this.#setMasterMonitorStatus(true, "Running as slave ...");
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

		// Process the item as received from the websocket
		// Send the item to the stream processing, to come out to the #dataBuffering function,
		// which will pass them to the processBroadcastMessage as newItem, as the type is set by this function.
		if (data.type == "newPreprocessedItem") {
			console.log("newPreprocessedItem", data);
			const item = this.#createValidatedItem(data.item, "newPreprocessedItem from WebSocket");
			if (item) {
				myStream.input({
					index: 0,
					type: "newItem",
					domain: this._monitor._settings.get("general.country"),
					item: item,
					reason: data.item.reason,
				});
			}
		}

		// Received from #dataBuffering function, the data is the result of the output of the stream processing.
		if (data.type == "newItem") {
			console.log("newItem", data);
			//The broadcastChannel will pass the item as an object, not an instance of Item.
			if (!(data.item instanceof Item)) {
				data.item = this.#createValidatedItem(
					data.item?.data,
					`newItem from BroadcastChannel (reason: ${data.reason || "unknown"})`
				);
				if (!data.item) return;
			}
			await this._monitor.addTileInGrid(data.item, data.reason);
		}

		if (data.type == "last100") {
			this.#processLast100Items(data.products);
		}
		if (data.type == "fetch100") {
			let itemIndex = 0;
			for (const itemData of JSON.parse(data.data)) {
				if (itemData.type == "newItem") {
					const item = this.#createValidatedItem(itemData.item?.data, `fetch100 batch item ${itemIndex}`);
					if (item) {
						await this._monitor.addTileInGrid(item, "Fetch latest");
					}
					itemIndex++;
				} else if (itemData.type == "fetchRecentItemsEnd") {
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

	#updateMasterMonitorStatus() {
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
				this.#setMasterMonitorStatus(false, "Master monitor not responding, reload the page.");
			}, 500);
			try {
				this._monitor._channel.postMessage({ type: "masterMonitorPing" });
				if (this._monitor._isMasterMonitor) {
					clearTimeout(this.#statusTimer);
					this.#statusTimer = null;
					this.#setMasterMonitorStatus(true, "Running as master ...");
				} else {
					//Will be set when we receive a pong from the master monitor.
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
			// Stringify once and reuse to avoid duplicate memory allocation
			const stringifiedBuffer = JSON.stringify(this.#dataBuffer);
			this._monitor._channel.postMessage({ type: "fetch100", data: stringifiedBuffer });
			this.processBroadcastMessage({ type: "fetch100", data: stringifiedBuffer });
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
			const item = this.#createValidatedItem(arrProducts[i], `processLast100Items at index ${i}`);
			if (!item) continue;

			//Only display notification for products with a title and image url
			//And that are more recent than the latest notification received.
			if (item.data.img_url == "" || item.data.title == "") {
				console.log("FETCH LATEST: item without title or image url: " + item.data.asin);
				continue;
			}

			myStream.input({
				index: i,
				type: "newItem",
				domain: this._monitor._settings.get("general.country"),
				item: item,
			});
		}
		myStream.input({ type: "fetchRecentItemsEnd" });
	}

	//#####################################################
	//## PUSH NOTIFICATIONS
	//#####################################################

	#pushNotification(notificationTitle, item) {
		if (!(item instanceof Item)) {
			throw new Error("item is not an instance of Item");
		}
		chrome.runtime.sendMessage({
			type: "pushNotification",
			item: item.getAllInfo(),
			title: notificationTitle,
		});
	}

	destroy() {
		// Clear the service worker status timer to prevent memory leak
		if (this.#serviceWorkerStatusTimer) {
			window.clearInterval(this.#serviceWorkerStatusTimer);
			this.#serviceWorkerStatusTimer = null;
		}

		// Clear the status timer if it exists
		if (this.#statusTimer) {
			window.clearTimeout(this.#statusTimer);
			this.#statusTimer = null;
		}

		// Remove channel event listener
		if (this._monitor._channel && this.#channelMessageHandler) {
			this._monitor._channel.removeEventListener("message", this.#channelMessageHandler);
			this.#channelMessageHandler = null;
		}

		// Clear static instance reference
		ServerCom.#instance = null;
	}
}

export { ServerCom };
