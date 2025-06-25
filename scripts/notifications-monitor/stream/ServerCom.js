/*global chrome*/

import {
	broadcastFunction,
	dataStream as myStream,
	notificationPushFunction,
} from "/scripts/notifications-monitor/stream/NewItemStreamProcessing.js";
import { Item } from "/scripts/core/models/Item.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();
class ServerCom {
	static #instance = null;

	_monitor = null;

	#serviceWorkerStatusTimer = null;
	#statusTimer = null;
	#channelMessageHandler = null;
	fetch100 = false;
	#dataBuffer = [];
	#processedItems = new Map(); // Track processed items to prevent duplicates
	#instanceId = `servercom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; // Unique instance ID

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

		//Only the master monitor should push notifications
		//Otherwise we get duplicates push notifications.
		if (Settings.get("general.debugNotifications")) {
			console.log("[ServerCom] Initializing notification push function:", {
				isMasterMonitor: this._monitor._isMasterMonitor,
				monitorId: this._monitor._monitorId,
			});
		}
		if (this._monitor._isMasterMonitor) {
			notificationPushFunction(this.#pushNotification);
		}
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
			console.error(`[ServerCom] ${context}: Item creation failed - ${error.message}`);
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

		// Skip messages from our own instance to prevent duplicate processing
		if (data.sourceInstanceId === this.#instanceId) {
			if (this._monitor._settings.get("general.debugServercom")) {
				console.log("[ServerCom] Skipping own broadcast message", {
					type: data.type,
					sourceInstanceId: data.sourceInstanceId,
				});
			}
			return false;
		}

		if (data.type == "masterMonitorPong") {
			const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
			if (debugCoordination) {
				console.log("[ServerCom] DEBUG: Received masterMonitorPong", {
					isMasterMonitor: this._monitor._isMasterMonitor,
					instanceId: this.#instanceId,
					timestamp: Date.now(),
				});
			}
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
			if (this._monitor._settings.get("general.debugServercom")) {
				console.log("[ServerCom] newPreprocessedItem", data);
			}
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
			// Check for duplicate processing
			const itemKey = data.item?.data?.asin || data.item?.asin;
			if (itemKey) {
				const now = Date.now();
				const lastProcessed = this.#processedItems.get(itemKey);

				// Skip if we've processed this item in the last 2 seconds
				if (lastProcessed && now - lastProcessed < 2000) {
					if (this._monitor._settings.get("general.debugServercom")) {
						console.log("[ServerCom] Skipping duplicate item", {
							asin: itemKey,
							timeSinceLastProcess: now - lastProcessed,
							sourceInstanceId: data.sourceInstanceId,
						});
					}
					return;
				}

				// Track this item as processed
				this.#processedItems.set(itemKey, now);

				// Clean up old entries (older than 10 seconds)
				for (const [asin, timestamp] of this.#processedItems) {
					if (now - timestamp > 10000) {
						this.#processedItems.delete(asin);
					}
				}
			}

			if (this._monitor._settings.get("general.debugServercom")) {
				console.log("[ServerCom] newItem", data);
			}
			
			//The broadcastChannel will pass the item as an object, not an instance of Item.
			if (!(data.item instanceof Item)) {
				const itemData = data.item?.data || data.item;
				
				data.item = this.#createValidatedItem(
					itemData,
					`newItem from BroadcastChannel (reason: ${data.reason || "unknown"})`
				);
				
				if (!data.item) {
					return;
				}
			}
			
			await this._monitor.addTileInGrid(data.item, data.reason);
		}

		if (data.type == "last100") {
			this.#processLast100Items(data.products);
		}
		if (data.type == "fetch100") {
			let itemIndex = 0;
			try {
				for (const itemData of JSON.parse(data.data)) {
					if (itemData.type == "newItem") {
						try {
							// Validate itemData.item exists before processing
							if (!itemData.item) {
								console.error(`[ServerCom] fetch100 item ${itemIndex}: No item data provided`);
								itemIndex++;
								continue;
							}
							
							// itemData.item is now always plain data after serialization
							const item = this.#createValidatedItem(
								itemData.item,
								`fetch100 batch item ${itemIndex}`
							);
							if (item) {
								await this._monitor.addTileInGrid(item, "Fetch latest");
							}
						} catch (itemError) {
							console.error(`Error processing fetch100 item ${itemIndex}:`, itemError);
							// Log the problematic data for debugging
							console.error(`Problematic item data:`, itemData);
							// Continue processing other items
						}
						itemIndex++;
					} else if (itemData.type == "fetchRecentItemsEnd") {
						this._monitor.fetchRecentItemsEnd();
					}
				}
			} catch (error) {
				console.error("Error processing fetch100 data:", error);
				// Ensure we always call fetchRecentItemsEnd to clean up state
				this._monitor.fetchRecentItemsEnd();
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
			if (this._monitor._settings.get("general.debugAutoload")) {
				console.log(`${new Date().toLocaleString()} - Reloading page: ${queue} page ${page}`);
			}
			this._monitor.fetchAutoLoadUrl(url, queue, page);
		}
	}

	#setWebSocketStatus(status, message = null) {
		const icon = document.querySelector("#statusWS div.vh-switch-32");
		const description = document.querySelector("#descriptionWS");

		// Add null checks to prevent errors when elements don't exist
		if (!icon || !description) {
			console.warn("[ServerCom] WebSocket status elements not found in DOM");
			return;
		}

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
		// Add source instance ID to prevent self-processing
		const dataWithSource = { ...data, sourceInstanceId: this.#instanceId };

		if (!this.fetch100) {
			// Always broadcast to other tabs
			this._monitor._channel.postMessage(dataWithSource);
			
			// Process locally only if this is the master monitor
			// This ensures items appear in single-tab scenarios while preventing duplicates in multi-tab
			if (this._monitor._isMasterMonitor) {
				const debugCoordination = this._monitor._settings?.get("general.debugCoordination");
				if (debugCoordination) {
					console.log("[ServerCom] DEBUG: Processing data locally (master only)", {
						type: data.type,
						isMasterMonitor: this._monitor._isMasterMonitor,
						instanceId: this.#instanceId,
						timestamp: Date.now(),
					});
				}
				this.processBroadcastMessage(data);
			}
			return;
		}
		
		// Convert Item instances to plain data before buffering
		const dataToBuffer = { ...data };
		if (data.item instanceof Item) {
			dataToBuffer.item = data.item.getAllInfo();
			if (this._monitor._settings.get("general.debugServercom")) {
				console.log("[ServerCom] Converting Item to plain data for buffering:", {
					type: data.type,
					hasItem: !!data.item,
					isItemInstance: true,
					asin: dataToBuffer.item.asin,
					hasConvertedData: !!dataToBuffer.item
				});
			}
		} else if (data.item) {
			if (this._monitor._settings.get("general.debugServercom")) {
				console.log("[ServerCom] Item already plain data:", {
					type: data.type,
					item: data.item,
					itemType: typeof data.item
				});
			}
		} else if (data.type === "newItem") {
			console.error("[ServerCom] WARNING: newItem with no item data being buffered!", {
				data: data,
				dataKeys: Object.keys(data)
			});
		}
		
		this.#dataBuffer.push(dataToBuffer);
		if (data.type == "fetchRecentItemsEnd") {
			// Stringify once and reuse to avoid duplicate memory allocation
			const stringifiedBuffer = JSON.stringify(this.#dataBuffer);
			
			// Send to other tabs via BroadcastChannel
			this._monitor._channel.postMessage({
				type: "fetch100",
				data: stringifiedBuffer,
				sourceInstanceId: this.#instanceId,
			});
			
			// Process our own fetch100 message directly
			// This ensures bulk fetch works even with a single tab
			// We use sourceInstanceId: "self" instead of this.#instanceId to bypass
			// the duplicate check. This way:
			// - Single tab: Processes items once (from this direct call)
			// - Multiple tabs: Master processes once (direct), slaves process once (broadcast)
			// The broadcast message with real instanceId will be skipped by the master
			this.processBroadcastMessage({
				type: "fetch100",
				data: stringifiedBuffer,
				sourceInstanceId: "self" // Different from this.#instanceId to bypass duplicate check
			});
			
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
				if (this._monitor._settings.get("general.debugServercom")) {
					console.log("FETCH LATEST: item without title or image url: " + item.data.asin);
				}
				continue;
			}

			const inputData = {
				index: i,
				type: "newItem",
				domain: this._monitor._settings.get("general.country"),
				item: item,
			};
			
			if (this._monitor._settings.get("general.debugServercom")) {
				console.log("[ServerCom] Pushing item to stream:", {
					index: i,
					asin: item.data.asin,
					hasItem: !!item,
					itemType: typeof item,
					isItemInstance: item instanceof Item
				});
			}
			
			myStream.input(inputData);
		}
		myStream.input({ type: "fetchRecentItemsEnd" });
	}

	//#####################################################
	//## PUSH NOTIFICATIONS
	//#####################################################

	#pushNotification = (notificationTitle, item) => {
		if (!(item instanceof Item)) {
			throw new Error("item is not an instance of Item");
		}
		const itemInfo = item.getAllInfo();
		const isMasterMonitor = this._monitor && this._monitor._isMasterMonitor;
		if (this._monitor._settings.get("general.debugServercom")) {
			console.log("[ServerCom] Sending OS notification:", {
				title: notificationTitle,
				asin: itemInfo.asin,
				isMasterMonitor: isMasterMonitor,
				hasMonitor: !!this._monitor,
				timestamp: Date.now(),
			});
		}
		chrome.runtime.sendMessage({
			type: "pushNotification",
			item: itemInfo,
			title: notificationTitle,
		});
	};

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
