/*global chrome*/

const DEBUG_MODE = false;
const VINE_HELPER_API_V5_WS_URL = "wss://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_WS_URL = "ws://127.0.0.1:3000";
const WSReconnectInterval = 12 * 1000; //12 seconds

import { io } from "/scripts/vendor/socket.io/client-dist/socket.io.esm.min.js";

class Websocket {
	static #instance = null;

	_monitor = null;
	#socket = null;
	#socket_connecting = false;
	#reconnectTimer = null;
	#channelMessageHandler = null;
	#socketHandlers = null;

	constructor(monitor) {
		if (Websocket.#instance) {
			return Websocket.#instance;
		}
		Websocket.#instance = this;
		this._monitor = monitor;
		this.#init();
		this.#createReconnectTimer();
		this.#createListener();
	}

	async #init() {
		try {
			await this._monitor._settings.refresh();
		} catch (e) {
			//Will catch an error from ChromeStorageAdapter.get() if the storage is not accessible
			this.#relayMessage({ type: "outOfContext" });
		}

		if (!this._monitor._settings.get("notification.active")) {
			this.#socket?.disconnect();
			return;
		}

		// If the socket is already connected, do not connect again
		if (this.#socket?.connected) {
			return;
		}

		if (this._monitor._i13nMgr.getCountryCode() === null) {
			console.error("Country not known, refresh/load a vine page.");
			return; //If the country is not known, do not connect
		}

		if (this.#socket_connecting) {
			if (this._monitor._settings.get("general.debugWebsocket")) {
				console.log(`${new Date().toLocaleString()} - WS already connecting, skipping.`);
			}
			return;
		}

		// Clean up any existing socket instance before creating a new one
		if (this.#socket) {
			this.#cleanupSocketListeners();
			this.#socket.removeAllListeners();
			this.#socket.disconnect();
			this.#socket = null;
		}

		this.#socket_connecting = true;
		this.#socket = io.connect(VINE_HELPER_API_V5_WS_URL, {
			query: {
				countryCode: DEBUG_MODE ? "com" : this._monitor._i13nMgr.getCountryCode(),
				uuid: this._monitor._settings.get("general.uuid", false),
				fid: this._monitor._settings.get("general.fingerprint.id", false),
				app_version: chrome.runtime.getManifest().version,
			}, // Pass the country code as a query parameter
			transports: ["websocket"],
			reconnection: false, //Handled manually every 30 seconds.
		});

		//## PASS ALL RECEIVED DATA TO THE MESSAGING CHANNEL #########################

		// Clean up any existing listeners before adding new ones
		this.#cleanupSocketListeners();

		// Define named handlers to reduce memory overhead and improve debugging
		this.#socketHandlers = {
			connect: () => {
				this.#socket_connecting = false;
				if (this._monitor._settings.get("general.debugWebsocket")) {
					console.log(`${new Date().toLocaleString()} - WS Connected`);
				}
				this.#relayMessage({ type: "wsStatus", status: "wsOpen" });
			},

			newItem: (data) => {
				// Debug logging for incoming item data
				if (this._monitor._settings.get("general.debugWebsocket")) {
					console.log("[WebSocket] Received newItem", {
						asin: data.item?.asin,
						hasImgUrl: !!data.item?.img_url,
						imgUrl: data.item?.img_url,
						itemKeys: data.item ? Object.keys(data.item) : [],
					});
				}

				this.#relayMessage({ type: "newPreprocessedItem", item: data.item });
			},

			last100: (data) => {
				this.#relayMessage({ type: "last100", products: data.products });
			},

			newETV: (data) => {
				this.#relayMessage({ type: "newETV", item: data.item });
			},

			newVariants: (data) => {
				this.#relayMessage({ type: "newVariants", item: data });
			},

			unavailableItem: (data) => {
				this.#relayMessage({ type: "unavailableItem", item: data.item });
			},

			reloadPage: async (data) => {
				this.#relayMessage({ type: "fetchAutoLoadUrl", queue: data.queue, page: data.page });
			},

			connection_error: (error) => {
				// Only pass minimal error info to prevent retaining large error objects
				this.#relayMessage({ type: "wsStatus", status: "wsError", error: error.message || "Connection error" });
			},

			disconnect: () => {
				this.#socket_connecting = false;
				if (this._monitor._settings.get("general.debugWebsocket")) {
					console.log(`${new Date().toLocaleString()} - Socket.IO Disconnected`);
				}
				this.#relayMessage({ type: "wsStatus", status: "wsClosed" });
			},

			connect_error: (error) => {
				this.#socket_connecting = false;
				// Extract only the message to avoid retaining the full error object
				const errorMessage = error.message || "Unknown error";
				this.#relayMessage({ type: "wsStatus", status: "wsError", error: errorMessage });
				console.error(`${new Date().toLocaleString()} - Socket.IO error: ${errorMessage}`);
			},
		};

		// Attach all handlers
		Object.entries(this.#socketHandlers).forEach(([event, handler]) => {
			this.#socket.on(event, handler);
		});
	}

	#relayMessage(message) {
		// Only log if debug is enabled
		if (this._monitor._settings.get("general.debugWebsocket")) {
			// Only log message type for performance - avoid logging large arrays
			if (message.type === "last100") {
				console.log(`Relaying message type: ${message.type}, products: ${message.products?.length || 0}`);
			} else {
				console.log("Relaying message", message);
			}
		}
		this._monitor._channel.postMessage(message);
		this._monitor._serverComMgr.processBroadcastMessage(message);
	}

	#createReconnectTimer() {
		// Clear any existing intervals
		if (this.#reconnectTimer) {
			clearInterval(this.#reconnectTimer);
		}
		// Create interval to check connection every WSReconnectInterval minutes
		this.#reconnectTimer = setInterval(() => {
			this.#init();
		}, WSReconnectInterval); // Convert minutes to milliseconds
	}

	#createListener() {
		// Store the handler reference for cleanup
		this.#channelMessageHandler = (event) => {
			this.processMessage(event.data);
		};
		this._monitor._channel.addEventListener("message", this.#channelMessageHandler);
	}

	processMessage(message) {
		//The service worker is passing along a request to fetch the latest items
		if (message.type === "fetchLatestItems") {
			//Get the last 100 most recent items
			if (this.#socket?.connected) {
				this.#socket.emit("getLast100", {
					app_version: chrome.runtime.getManifest().version,
					uuid: this._monitor._settings.get("general.uuid", false),
					fid: this._monitor._settings.get("general.fingerprint.id", false),
					countryCode: DEBUG_MODE ? "com" : this._monitor._i13nMgr.getCountryCode(),
					limit: message.limit || 100,
					request_variants:
						this._monitor._settings.isPremiumUser(2) &&
						this._monitor._settings.get("general.displayVariantButton"),
				});
			} else {
				console.warn("Socket not connected - cannot fetch last 100 items");
			}
		}

		//The service worker is passing along a request to report the websocket status
		if (message.type === "wsStatus") {
			if (this._monitor._isMasterMonitor) {
				this.#relayMessage({
					type: "wsStatus",
					status: this.#socket?.connected ? "wsOpen" : "wsClosed",
				});
			}
		}
	}

	isConnected() {
		return this.#socket?.connected || false;
	}

	emit(type, data) {
		this.#socket.emit(type, data);
	}

	disconnect() {
		this.#socket.disconnect();
	}

	destroyInstance() {
		// Clear the reconnect timer
		if (this.#reconnectTimer) {
			clearInterval(this.#reconnectTimer);
			this.#reconnectTimer = null;
		}

		// Remove channel listener
		if (this._monitor._channel) {
			this._monitor._channel.removeEventListener("message", this.#channelMessageHandler);
			this.#channelMessageHandler = null;
		}

		// Remove all event listeners
		if (this.#socket) {
			this.#socket.removeAllListeners();
			this.#socket.disconnect();
			this.#socket = null;
		}

		this.#socket_connecting = false;
		Websocket.#instance = null;
	}

	/**
	 * Clean up socket event listeners before re-adding them
	 */
	#cleanupSocketListeners() {
		if (this.#socket && this.#socketHandlers) {
			// Remove all handlers using the same references
			Object.entries(this.#socketHandlers).forEach(([event, handler]) => {
				this.#socket.off(event, handler);
			});
		}
		// Clear the handlers object to free memory
		this.#socketHandlers = null;
	}
}

export { Websocket };
