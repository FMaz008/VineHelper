const DEBUG_MODE = false; //Will switch the notification countries to "com"
const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";
const VINE_HELPER_API_V5_WS_URL = "wss://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_WS_URL = "ws://127.0.0.1:3000";

import { Internationalization } from "../scripts/Internationalization.js";
import { SettingsMgr } from "../scripts/SettingsMgr.js";
import {
	dataStream as myStream,
	broadcastFunction,
	notificationPushFunction,
} from "./service_worker/NewItemStreamProcessing.js";
import "../node_modules/socket.io/client-dist/socket.io.min.js";

//Bind/Inject the service worker's functions to the dataStream.
broadcastFunction(sendMessageToAllTabs);
notificationPushFunction(pushNotification);

var I13n = new Internationalization();
var Settings = new SettingsMgr();
var notificationsData = {};
var WSReconnectInterval = 0.3; //Firefox shutdown the background script after 30seconds.

if (typeof browser === "undefined") {
	var browser = chrome;
}

//#####################################################
//## LISTENERS
//#####################################################
browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
	if (data.type == undefined) {
		return false;
	}

	if (data.type == "fetchLast100Items") {
		//Get the last 100 most recent items
		fetchLast100Items();
		sendResponse({ success: true });
	}

	if (data.type == "setCountryCode") {
		I13n.setCountryCode(data.countryCode);
		sendResponse({ success: true });
	}

	if (data.type == "wsStatus") {
		sendResponse({ success: true });
		if (socket?.connected) {
			sendMessageToAllTabs({ type: "wsOpen" }, "Websocket server connected.");
		} else {
			sendMessageToAllTabs({ type: "wsClosed" }, "Websocket server disconnected.");
		}
	}
});

browser.alarms.onAlarm.addListener(async (alarm) => {
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
	if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
		chrome.tabs.create({
			url: `https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`,
		});
	} else {
		chrome.tabs.create({
			url: `https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?search=${search}`,
		});
	}
});

//Websocket

let socket;
function connectWebSocket() {
	if (!Settings.get("notification.active") || socket?.connected) {
		//Not reconnecting to WS.
		return;
	}

	if (I13n.getCountryCode() === null) {
		console.error("Country not known, refresh/load a vine page.");
		return; //If the country is not known, do not connect
	}

	socket = io.connect(VINE_HELPER_API_V5_WS_URL, {
		query: {
			countryCode: DEBUG_MODE ? "com" : I13n.getCountryCode(),
			uuid: Settings.get("general.uuid", false),
		}, // Pass the country code as a query parameter
		transports: ["websocket"],
		reconnection: false, //Handled manually every 30 seconds.
	});

	// On connection success
	socket.on("connect", () => {
		console.log("WS Connected");
		sendMessageToAllTabs({ type: "wsOpen" }, "Socket.IO server connected.");
	});

	socket.on("newItem", (data) => {
		// Assuming the server sends the data in the same format as before
		myStream.input({
			index: 0,
			type: "newItem",
			domain: Settings.get("general.country"),
			date: data.item.date,
			asin: data.item.asin,
			title: data.item.title,
			//search: data.item.search,
			img_url: data.item.img_url,
			etv_min: data.item.etv_min, //null
			etv_max: data.item.etv_max, //null
			reason: data.item.reason,
			queue: data.item.queue,
			is_parent_asin: data.item.is_parent_asin,
			enrollment_guid: data.item.enrollment_guid,
		});
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

	// On disconnection
	socket.on("disconnect", () => {
		console.log("WS Disconnected");
		sendMessageToAllTabs({ type: "wsClosed" }, "Socket.IO server disconnected.");
	});

	// On error
	socket.on("connect_error", (error) => {
		console.error(`Socket.IO error: ${error.message}`);
	});
}

//#####################################################
//## BUSINESS LOGIC
//#####################################################

init();

//Load the settings, if no settings, try again in 10 sec
async function init() {
	await retrieveSettings();

	//Check for new items (if the option is disabled the method will return)
	browser.alarms.create("websocketReconnect", { periodInMinutes: WSReconnectInterval });

	if (Settings.get("notification.active")) {
		//Firefox sometimes re-initialize the background script.
		//Do not attempt to recreate a new websocket if this method is called when
		//a websocket already exist.
		if (socket?.connected == undefined) {
			connectWebSocket();
		}
	}
}

async function retrieveSettings() {
	//Wait for the settings to be loaded.
	while (!Settings.isLoaded()) {
		await new Promise((r) => setTimeout(r, 10));
	}

	//Set the locale
	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		I13n.setCountryCode(countryCode);
	}
}

async function fetchLast100Items() {
	if (I13n.getCountryCode() === null) {
		return false; //If the country is not known, do not query
	}

	const content = {
		api_version: 5,
		country: DEBUG_MODE ? "com" : Settings.get("general.country"),
		action: "get_latest_notifications",
		uuid: Settings.get("general.uuid", false),
	};
	const options = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	};

	fetch(VINE_HELPER_API_V5_URL, options)
		.then((response) => response.json())
		.then(async function (response) {
			//TODO: Client side sort the response.products array in order of response.products[i].date DESC. (most recent at the top)
			response.products.sort((a, b) => {
				const dateA = new Date(a.date);
				const dateB = new Date(b.date);
				return dateB - dateA;
			});
			for (let i = response.products.length - 1; i >= 0; i--) {
				const {
					title,
					date,
					timestamp,
					asin,
					img_url,
					etv_min,
					etv_max,
					queue,
					is_parent_asin,
					enrollment_guid,
				} = response.products[i];

				//Only display notification for products with a title and image url
				//And that are more recent than the latest notification received.
				if (img_url == "" || title == "") {
					continue;
				}

				Settings.set("notification.lastProduct", timestamp);
				myStream.input({
					index: i,
					type: "newItem",
					domain: Settings.get("general.country"),
					date: date,
					asin: asin,
					title: title,
					img_url: img_url,
					etv_min: etv_min,
					etv_max: etv_max,
					queue: queue,
					reason: "Fetch last 100 new items",
					is_parent_asin: is_parent_asin,
					enrollment_guid: enrollment_guid,
				});
			}
		})
		.catch(function () {
			(error) => console.log(error);
		});
}

function pushNotification(asin, queue, is_parent_asin, enrollment_guid, search_string, title, description, img_url) {
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
		},
		(notificationId) => {
			if (chrome.runtime.lastError) {
				console.error("Notification error:", chrome.runtime.lastError);
			}
		}
	);
}

async function sendMessageToAllTabs(data, debugInfo) {
	try {
		const tabs = await browser.tabs.query({ currentWindow: true });
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
						browser.tabs.sendMessage(tab.id, data, (response) => {
							if (browser.runtime.lastError) {
								//console.log(tab);
								//console.error("Error sending message to tab:", browser.runtime.lastError.message);
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
