const DEBUG_MODE = false; //Will switch the notification countries to "com"
const VINE_HELPER_API_V5_WS_URL = "wss://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_WS_URL = "ws://127.0.0.1:3000";
const channel = new BroadcastChannel("VineHelper");

import "../node_modules/socket.io/client-dist/socket.io.min.js";
import { Internationalization } from "../scripts/Internationalization.js";
import { SettingsMgr } from "../scripts/SettingsMgr.js";
import {
	broadcastFunction,
	dataStream as myStream,
	notificationPushFunction,
} from "./service_worker/NewItemStreamProcessing.js";

//Bind/Inject the service worker's functions to the dataStream.
broadcastFunction(dataBuffering);
notificationPushFunction(pushNotification);

var i13n = new Internationalization();
var Settings = new SettingsMgr();
var notificationsData = {};
var WSReconnectInterval = 0.2; //Firefox shutdown the background script after 30seconds.
var lastActivityUpdate = Date.now();

if (typeof browser === "undefined") {
	var browser = chrome;
}

var fetch100 = false;
var dataBuffer = [];
function dataBuffering(data) {
	if (!fetch100) {
		sendMessageToAllTabs(data);
		return;
	}
	dataBuffer.push(data);
	if (data.type == "fetchRecentItemsEnd") {
		sendMessageToAllTabs({ type: "fetch100", data: dataBuffer });
		dataBuffer = [];
		fetch100 = false;
	}
}

//#####################################################
//## LISTENERS
//#####################################################
channel.onmessage = (event) => {
	processBroadcastMessage(event.data);
};

chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
	sendResponse({ success: true });

	processBroadcastMessage(data);
});

async function processBroadcastMessage(data) {
	if (data.type == undefined) {
		return false;
	}

	if (data.type == "ping") {
		sendMessageToAllTabs({ type: "pong" }, "Service worker is running.");

		//Update the last activity time as a unix timestamp
		if (Date.now() - lastActivityUpdate >= 1 * 60 * 1000) {
			let minutesUsed = parseInt(Settings.get("metrics.minutesUsed"));
			Settings.set("metrics.minutesUsed", minutesUsed + 1);
			lastActivityUpdate = Date.now();
		}
	}

	if (data.type == "fetchLatestItems") {
		//Get the last 100 most recent items
		if (socket?.connected) {
			socket.emit("getLast100", {
				app_version: chrome.runtime.getManifest().version,
				uuid: Settings.get("general.uuid", false),
				fid: Settings.get("general.fingerprint.id", false),
				countryCode: i13n.getCountryCode(),
				limit: data.limit || 100,
				request_variants: Settings.isPremiumUser(2) && Settings.get("general.displayVariantButton"),
			});
		} else {
			console.warn("Socket not connected - cannot fetch last 100 items");
		}
	}

	if (data.type == "setCountryCode") {
		i13n.setCountryCode(data.countryCode);
	}

	if (data.type == "wsStatus") {
		if (socket?.connected) {
			sendMessageToAllTabs({ type: "wsOpen" }, "Websocket server connected.");
		} else {
			sendMessageToAllTabs({ type: "wsClosed" }, "Websocket server disconnected.");
		}
	}

	//Close the auto-refresh tab
	if (data.type == "closeARTab") {
		if (currentTabId !== null) {
			try {
				await closeTab(currentTabId);
				currentTabId = null;
			} catch (error) {
				console.error("Unexpected error closing tab:", error);
			}
		}
	}
}

async function closeTab(tabId) {
	try {
		// Firefox requires a different approach for tab removal
		if (typeof browser !== "undefined") {
			// Firefox
			return new Promise(async (resolve) => {
				try {
					await browser.tabs.get(tabId);
					await browser.tabs.remove(tabId);
					resolve(true);
				} catch (error) {
					resolve(false);
				}
			});
		} else {
			// Chrome
			return new Promise((resolve) => {
				chrome.tabs.get(tabId, (tab) => {
					if (chrome.runtime.lastError) {
						resolve(false);
						return;
					}

					chrome.tabs.remove(tabId, () => {
						if (chrome.runtime.lastError) {
							resolve(false);
						} else {
							resolve(true);
						}
					});
				});
			});
		}
	} catch (error) {
		throw error;
	}
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
	//Reload the settings as a change to the keyword list would require the SW to be reloaded to
	//be taken into consideration
	await Settings.refresh();
	await retrieveSettings();

	if (alarm.name === "websocketReconnect") {
		if (Settings.get("notification.active")) {
			connectWebSocket(); //Check the status of the websocket, reconnect if closed.
		} else {
			socket?.disconnect();
		}
	}
});

chrome.notifications.onClicked.addListener((notificationId) => {
	const { asin, queue, is_parent_asin, enrollment_guid, search } = notificationsData[notificationId];
	let url;
	if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
		url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`;
	} else {
		url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search}`;
	}
	chrome.tabs.create({
		url: url,
	});
});

//Websocket

let socket;
let currentTabId = null;

function connectWebSocket() {
	if (!Settings.get("notification.active")) {
		return;
	}

	// If the socket is already connected, do not connect again
	if (socket?.connected) {
		return;
	}

	if (i13n.getCountryCode() === null) {
		console.error("Country not known, refresh/load a vine page.");
		return; //If the country is not known, do not connect
	}

	socket = io.connect(VINE_HELPER_API_V5_WS_URL, {
		query: {
			countryCode: DEBUG_MODE ? "com" : i13n.getCountryCode(),
			uuid: Settings.get("general.uuid", false),
			fid: Settings.get("general.fingerprint.id", false),
			app_version: chrome.runtime.getManifest().version,
		}, // Pass the country code as a query parameter
		transports: ["websocket"],
		reconnection: false, //Handled manually every 30 seconds.
	});

	// On connection success
	socket.on("connect", () => {
		console.log(`${new Date().toLocaleString()} - WS Connected`);
		sendMessageToAllTabs({ type: "wsOpen" }, "Socket.IO server connected.");
	});

	socket.on("newItem", (data) => {
		// Assuming the server sends the data in the same format as before
		myStream.input({
			index: 0,
			type: "newItem",
			domain: Settings.get("general.country"),
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
	});
	socket.on("last100", (data) => {
		// Assuming the server sends the data in the same format as before
		processLast100Items(data.products);
	});
	socket.on("newETV", (data) => {
		sendMessageToAllTabs(
			{
				type: "newETV",
				asin: data.item.asin,
				etv: data.item.etv,
			},
			"ETV update"
		);

		let data1 = {};
		data1.type = "hookExecute";
		data1.hookname = "newItemETV";
		data1.asin = data.item.asin;
		data1.etv = data.item.etv;
		sendMessageToAllTabs(data1, "newItemETV");
	});

	socket.on("newVariants", (data) => {
		data.type = "newVariants";
		sendMessageToAllTabs(data, "newVariants");
	});

	socket.on("unavailableItem", (data) => {
		sendMessageToAllTabs({
			type: "unavailableItem",
			domain: Settings.get("general.country"),
			asin: data.item.asin,
			reason: data.item.reason,
		});
	});

	socket.on("reloadPage", async (data) => {
		if (!data.queue || !data.page) {
			return false;
		}
		const queue = data.queue;
		const page = data.page;

		const queueTable = { AI: "encore", AFA: "last_chance", RFY: "potluck" };
		const url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=${queueTable[queue]}&page=${page}#AR`;
		console.log(`${new Date().toLocaleString()} - Reloading page: ${queue} page ${page}`);
		if (currentTabId !== null) {
			//Close tab id
			chrome.tabs.remove(currentTabId);
		}
		//Find the windows id containing the notification monitor with a url containing #monitor
		if (chrome.windows) {
			const windows = await chrome.windows.getAll();
			outerLoop: for (const window of windows) {
				//List all tabs in the window
				const tabs = await chrome.tabs.query({ windowId: window.id });
				for (const tab of tabs) {
					if (tab.url.includes("#monitor")) {
						if (typeof browser !== "undefined") {
							// Firefox
							browser.tabs
								.create({ url, windowId: window.id, active: false })
								.then((newTab) => {
									currentTabId = newTab.id;
								})
								.catch((error) => {});
						} else {
							// Chrome
							const newTab = chrome.tabs.create({ url, windowId: window.id, active: false });
							currentTabId = newTab.id;
						}
						break outerLoop;
					}
				}
			}
		}
	});

	socket.on("connection_error", (error) => {
		sendMessageToAllTabs({ type: "wsError", error: error }, "Socket.IO connection error");
		console.error(`${new Date().toLocaleString()} - Socket.IO connection error: ${error}`);
	});

	// On disconnection
	socket.on("disconnect", () => {
		console.log(`${new Date().toLocaleString()} - WS Disconnected`);
		sendMessageToAllTabs({ type: "wsClosed" }, "Socket.IO server disconnected.");
	});

	// On error
	socket.on("connect_error", (error) => {
		console.error(`${new Date().toLocaleString()} - Socket.IO error: ${error.message}`);
	});
}

//#####################################################
//## BUSINESS LOGIC
//#####################################################

init();

//Load the settings, if no settings, try again in 10 sec
async function init() {
	await retrieveSettings();

	// Clear any existing alarms first
	await chrome.alarms.clearAll();

	//Check for new items (if the option is disabled the method will return)
	chrome.alarms.create("websocketReconnect", { periodInMinutes: WSReconnectInterval });

	if (Settings.get("notification.active")) {
		//Firefox sometimes re-initialize the background script.
		//Do not attempt to recreate a new websocket if this method is called when
		//a websocket already exist.
		if (!socket?.connected) {
			connectWebSocket();
		}

		setReloadTimer();
	}
}

async function retrieveSettings() {
	//Wait for the settings to be loaded.
	await Settings.waitForLoad();

	//Set the locale
	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
	}
}

let displayTimer = null;
let reloadTimer = null;

function setReloadTimer() {
	// Clear any existing timers first
	if (displayTimer) {
		clearTimeout(displayTimer);
		displayTimer = null;
	}
	if (reloadTimer) {
		clearTimeout(reloadTimer);
		reloadTimer = null;
	}

	//Create an interval between 5 and 10 minutes to check with the server if a page needs to be refreshed
	//const timer = 30 * 1000; //1 minute
	const timer = Math.floor(Math.random() * (10 * 60 * 1000 - 5 * 60 * 1000 + 1) + 5 * 60 * 1000); //In milliseconds

	displayTimer = setTimeout(() => {
		const timerInMinutes = Math.floor(timer / 60 / 1000);
		const secondsLeft = Math.floor((timer - timerInMinutes * 60 * 1000) / 1000);
		console.log(
			`${new Date().toLocaleString()} - Setting reload timer to ${timerInMinutes} minutes and ${secondsLeft} seconds`
		);
	}, 500);

	reloadTimer = setTimeout(async () => {
		//Send a websocket request
		if (
			socket?.connected &&
			i13n.getCountryCode() &&
			!Settings.get("thorvarium.mobileandroid") &&
			!Settings.get("thorvarium.mobileios")
		) {
			// First check for active, focused monitor tab
			const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
			const activeMonitorTab = activeTabs.find((tab) => tab.url && tab.url.includes("#monitor"));

			// If no active monitor tab, check for any monitor tab in any window
			if (!activeMonitorTab) {
				//Check if there is a (non-active)monitor tab in any tab
				const allTabs = await chrome.tabs.query({});
				const monitorTab = allTabs.find((tab) => tab.url && tab.url.includes("#monitor"));

				if (monitorTab) {
					// Check if the window containing the monitor tab is minimized/unfocused
					const window = await chrome.windows.get(monitorTab.windowId);
					if (window.state === "minimized" || !window.focused) {
						console.log(
							`${new Date().toLocaleString()} - Found monitor tab in minimized/unfocused window, sending reload request`
						);
						socket.emit("reloadRequest", {
							uuid: Settings.get("general.uuid", false),
							fid: Settings.get("general.fingerprint.id", false),
							countryCode: i13n.getCountryCode(),
						});
					} else {
						console.log(
							`${new Date().toLocaleString()} - Monitor tab not active and window not minimized/unfocused. Skipping.`
						);
					}
				} else {
					console.log(`${new Date().toLocaleString()} - No monitor tab found, skipping.`);
				}
			} else {
				console.log(`${new Date().toLocaleString()} - Found active monitor tab, sending reload request`);
				socket.emit("reloadRequest", {
					uuid: Settings.get("general.uuid", false),
					fid: Settings.get("general.fingerprint.id", false),
					countryCode: i13n.getCountryCode(),
				});
			}
		}
		setReloadTimer(); //Create a new timer
	}, timer);
}

function processLast100Items(arrProducts) {
	arrProducts.sort((a, b) => {
		const dateA = new Date(a.date);
		const dateB = new Date(b.date);
		return dateB - dateA;
	});
	fetch100 = true;
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
			domain: Settings.get("general.country"),
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

function pushNotification(asin, queue, is_parent_asin, enrollment_guid, search_string, title, description, img_url) {
	chrome.permissions.contains({ permissions: ["notifications"] }, (result) => {
		if (result) {
			notificationsData["item-" + asin] = {
				asin: asin,
				queue: queue,
				is_parent_asin: is_parent_asin,
				enrollment_guid: enrollment_guid,
				search: search_string,
			};
			chrome.notifications.create(
				"item-" + asin,
				{
					type: "basic",
					iconUrl: img_url,
					title: title,
					message: description,
					priority: 2,
					silent: false,
					//requireInteraction: true
				},
				(notificationId) => {
					if (chrome.runtime.lastError) {
						console.error("Notification error:", chrome.runtime.lastError);
					} else {
						// Verify the notification exists
						chrome.notifications.getAll((notifications) => {
							if (!notifications[notificationId]) {
								console.warn(
									`Notification ${notificationId} was created but not found in active notifications`
								);
							}
						});
					}
				}
			);
		}
	});
}

async function sendMessageToAllTabs(data, debugInfo) {
	channel.postMessage(data);
	try {
		const tabs = await chrome.tabs.query({});
		const regex = /^.+?amazon\.([a-z.]+).*\/vine\/.*$/;
		tabs.forEach((tab) => {
			if (tab) {
				//Check to make sure this is a VineHelper tab:
				const match = regex.exec(tab.url);
				if (tab.url != undefined && match) {
					if (DEBUG_MODE) {
						//console.log("Sending message to tab " + tab.url);
						//console.log(tab.url);
					}

					try {
						chrome.tabs.sendMessage(tab.id, data, (response) => {
							if (chrome.runtime.lastError) {
								//console.log(tab);
								//console.error("Error sending message to tab:", chrome.runtime.lastError.message);
							}
						});
					} catch (e) {
						if (DEBUG_MODE) {
							console.error("Error sending message to tab:", e);
						}
					}
				}
			}
		});
	} catch (error) {
		if (DEBUG_MODE) {
			console.error("Error querying tabs:", error);
		}
	}
}

let selectedWord = "";
// Create static context menu items
chrome.runtime.onInstalled.addListener(() => {
	// Clear existing menu items before creating new ones
	chrome.contextMenus.removeAll();

	const patterns = [
		"https://*.amazon.com/vine/*",
		"https://*.amazon.co.uk/vine/*",
		"https://*.amazon.co.jp/vine/*",
		"https://*.amazon.de/vine/*",
		"https://*.amazon.fr/vine/*",
		"https://*.amazon.it/vine/*",
		"https://*.amazon.es/vine/*",
		"https://*.amazon.ca/vine/*",
		"https://*.amazon.com.au/vine/*",
		"https://*.amazon.com.br/vine/*",
		"https://*.amazon.com.mx/vine/*",
		"https://*.amazon.sg/vine/*",
	];

	chrome.contextMenus.create({
		id: "copy-asin",
		title: "Copy ASIN",
		contexts: ["all"],
		documentUrlPatterns: patterns,
	});
	chrome.contextMenus.create({
		id: "add-to-highlightKeywords",
		title: "Add to highlight keywords",
		contexts: ["all"],
		documentUrlPatterns: patterns,
	});
	chrome.contextMenus.create({
		id: "add-to-hideKeywords",
		title: "Add to hide keywords",
		contexts: ["all"],
		documentUrlPatterns: patterns,
	});
});

// Store the word sent by the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "setWord" && message.word) {
		selectedWord = message.word; // Update the selected word
	}
});

// Handle context menu clicks and save the word
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "copy-asin") {
		chrome.tabs.sendMessage(tab.id, { action: "copyASIN" });
		return;
	}

	if (!selectedWord) {
		console.error("No word selected!");
		return;
	}

	const list = info.menuItemId === "add-to-hideKeywords" ? "Hide" : "Highlight";

	chrome.tabs.sendMessage(tab.id, { action: "showPrompt", word: selectedWord, list: list }, async (response) => {
		if (response && response.confirmed) {
			const confirmedWord = response.word;

			const newKeyword = {
				contains: confirmedWord,
				without: "",
				etv_min: "",
				etv_max: "",
			};

			if (list === "Hide") {
				const arrHide = await Settings.get("general.hideKeywords");
				let newArrHide = [...arrHide, newKeyword];

				//Sort the list
				newArrHide.sort((a, b) => {
					if (a.contains.toLowerCase() < b.contains.toLowerCase()) return -1;
					if (a.contains.toLowerCase() > b.contains.toLowerCase()) return 1;
					return 0;
				});

				Settings.set("general.hideKeywords", newArrHide);
			} else if (list === "Highlight") {
				const arrHighlight = await Settings.get("general.highlightKeywords");
				let newArrHighlight = [...arrHighlight, newKeyword];

				//Sort the list
				newArrHighlight.sort((a, b) => {
					if (a.contains.toLowerCase() < b.contains.toLowerCase()) return -1;
					if (a.contains.toLowerCase() > b.contains.toLowerCase()) return 1;
					return 0;
				});

				Settings.set("general.highlightKeywords", newArrHighlight);
			}
		}
	});
});
