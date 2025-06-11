/*global chrome*/
const DEBUG_MODE = false;
const VINE_HELPER_API_V5_WS_URL = "wss://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_WS_URL = "ws://127.0.0.1:3000";
const WSReconnectInterval = 12 * 1000; //12 seconds

import { io } from "../../node_modules/socket.io/client-dist/socket.io.esm.min.js";

class Websocket {
	_monitor = null;
	#socket = null;
	#socket_connecting = false;
	#reconnectTimer = null;

	constructor(monitor) {
		this._monitor = monitor;
		this.#init();
		this.#createReconnectTimer();
		this.#createListener();
	}

	async #init() {
		await this._monitor._settings.refresh();
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
			console.log(`${new Date().toLocaleString()} - WS already connecting, skipping.`);
			return;
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

		//## PASS ALL RECEIVED DATA TO THE SERVICE WORKER #########################
		// On connection success
		this.#socket.on("connect", () => {
			this.#socket_connecting = false;
			console.log(`${new Date().toLocaleString()} - WS Connected`);
			chrome.runtime.sendMessage({ type: "wsStatus", status: "wsOpen" });
		});

		this.#socket.on("newItem", (data) => {
			console.log(data);
			chrome.runtime.sendMessage({ type: "newItem", item: data.item });
		});
		this.#socket.on("last100", (data) => {
			chrome.runtime.sendMessage({ type: "last100", products: data.products });
		});
		this.#socket.on("newETV", (data) => {
			chrome.runtime.sendMessage({ type: "newETV", item: data.item });
		});

		this.#socket.on("newVariants", (data) => {
			chrome.runtime.sendMessage({ type: "newVariants", data: data });
		});

		this.#socket.on("unavailableItem", (data) => {
			chrome.runtime.sendMessage({ type: "unavailableItem", item: data.item });
		});

		this.#socket.on("reloadPage", async (data) => {
			console.log(data);
			chrome.runtime.sendMessage({ type: "reloadPage", queue: data.queue, page: data.page });
		});

		this.#socket.on("connection_error", (error) => {
			chrome.runtime.sendMessage({ type: "connection_error", data: data });
		});

		// On disconnection
		this.#socket.on("disconnect", () => {
			this.#socket_connecting = false;
			console.log(`${new Date().toLocaleString()} - Socket.IO Disconnected`);
			chrome.runtime.sendMessage({ type: "wsStatus", status: "wsClosed" });
		});

		// On error
		this.#socket.on("connect_error", (error) => {
			this.#socket_connecting = false;
			console.error(`${new Date().toLocaleString()} - Socket.IO error: ${error.message}`);
		});
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
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			this.#processMessage(message, sender, sendResponse);
		});
		window.addEventListener("message", (event) => {
			this.#processMessage(event.data);
		});
	}

	#processMessage(message, sender, sendResponse) {
		//If the service worker wsPing the master monitor, confirm we are still alive
		if (message.type === "wsPing") {
			chrome.runtime.sendMessage({
				type: "wsPong",
			});
		}

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
			chrome.runtime.sendMessage({
				type: "wsStatus",
				status: this.#socket?.connected ? "wsOpen" : "wsClosed",
			});
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

		// Remove all event listeners
		if (this.#socket) {
			this.#socket.removeAllListeners();
			this.#socket.disconnect();
			this.#socket = null;
		}

		this.#socket_connecting = false;
	}
}

export { Websocket };
