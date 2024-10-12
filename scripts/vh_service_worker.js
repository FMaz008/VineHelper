const DEBUG_MODE = false; //Will switch the notification countries to "com"
const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";
const VINE_HELPER_API_V5_WS_URL = "wss://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_WS_URL = "ws://127.0.0.1:3000";

import { SettingsMgr } from "../scripts/SettingsMgr.js";
import { Streamy } from "./Streamy.js";
import "../node_modules/socket.io/client-dist/socket.io.min.js";

const myStream = new Streamy();
const filterHideitem = myStream.filter(function (data) {
	if (Settings.get("notification.hideList")) {
		const hideKWMatch = keywordMatch(Settings.get("general.hideKeywords"), data.title);
		if (hideKWMatch) {
			return false; //Do not display the notification as it matches the hide list.
		}
	}
	return true;
});
const transformIsHighlight = myStream.transformer(function (data) {
	const highlightKWMatch = keywordMatch(Settings.get("general.highlightKeywords"), data.title);
	data.KWsMatch = highlightKWMatch;
	return data;
});
const transformSearchPhrase = myStream.transformer(function (data) {
	const search = data.title.replace(/^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/, "$1");
	data.search = search;
	return data;
});
const transformUnixTimestamp = myStream.transformer(function (data) {
	data.timestamp = dateToUnixTimestamp(data.date);
	return data;
});
const transformPostNotification = myStream.transformer(function (data) {
	//If the new item match a highlight keyword, push a real notification.
	if (Settings.get("notification.pushNotifications") && data.KWsMatch) {
		pushNotification(
			data.asin,
			data.queue,
			data.is_parent_asin,
			data.enrollment_guid,
			data.search,
			"Vine Helper - New item match KW!",
			data.title,
			data.img_url
		);
	}
	//If the new item match in AFA queue, push a real notification.
	else if (Settings.get("notification.pushNotificationsAFA") && data.queue == "last_chance") {
		pushNotification(
			data.asin,
			data.queue,
			data.is_parent_asin,
			data.enrollment_guid,
			data.search,
			"Vine Helper - New AFA item",
			data.title,
			data.img_url
		);
	}
	return data;
});
myStream
	.pipe(filterHideitem)
	.pipe(transformIsHighlight)
	.pipe(transformSearchPhrase)
	.pipe(transformUnixTimestamp)
	.pipe(transformPostNotification)
	.output((data) => {
		//Broadcast the notification
		//console.log("Broadcasting new item " + data.asin);
		sendMessageToAllTabs(data, "notification");
	});

/*
if ("function" == typeof importScripts) {
	importScripts("../scripts/SettingsMgr.js");
}
*/

var Settings = new SettingsMgr();
var notificationsData = {};
var newItemCheckInterval = 0.3; //Firefox shutdown the background script after 30seconds.
const broadcastChannel = new BroadcastChannel("VineHelperChannel");
const vineDomains = {
	ca: "ca",
	com: "com",
	uk: "co.uk",
	jp: "co.jp",
	de: "de",
	fr: "fr",
	es: "es",
	it: "it",
};
var vineDomain;

if (typeof browser === "undefined") {
	var browser = chrome;
}

//#####################################################
//## LISTENERS
//#####################################################
browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
	if (data.type == "fetchLast100Items") {
		//Get the last 100 most recent items
		if (Settings.get("notification.websocket")) {
			fetchLast100Items(true);
		}
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

	if (alarm.name === "checkNewItems") {
		if (!Settings.get("notification.websocket") || !Settings.get("notification.active")) {
			socket?.disconnect();
		}
		if (Settings.get("notification.active")) {
			if (Settings.get("notification.websocket")) {
				connectWebSocket(); //Check the status of the websocket, reconnect if closed.
			} else {
				fetchLast100Items();
			}
		}
	}
});

chrome.notifications.onClicked.addListener((notificationId) => {
	const { asin, queue, is_parent_asin, enrollment_guid, search } = notificationsData[notificationId];
	if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
		chrome.tabs.create({
			url: `https://www.amazon.${vineDomain}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin};${enrollment_guid}`,
		});
	} else {
		chrome.tabs.create({
			url: `https://www.amazon.${vineDomain}/vine/vine-items?search=${search}`,
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

	if (Settings.get("general.country") === null) {
		return; //If the country is not known, do not connect
	}

	socket = io.connect(VINE_HELPER_API_V5_WS_URL, {
		query: {
			countryCode: DEBUG_MODE ? "com" : Settings.get("general.country"),
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
			search: data.item.search,
			img_url: data.item.img_url,
			etv: data.item.etv,
			queue: data.item.queue,
			is_parent_asin: data.item.is_parent_asin,
			enrollment_guid: data.item.enrollment_guid,
		});

		sendMessageToAllTabs({ type: "newItemCheckEnd" }, "End of notification(s) update");
	});
	socket.on("newETV", (data) => {
		sendMessageToAllTabs(
			{
				type: "ETVUpdate",
				asin: data.item.asin,
				etv: data.item.etv,
			},
			"ETV update"
		);
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
	browser.alarms.create("checkNewItems", { periodInMinutes: newItemCheckInterval });

	if (Settings.get("notification.active") && Settings.get("notification.websocket")) {
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

	//Set the country
	vineDomain = vineDomains[Settings.get("general.country")];
}

async function fetchLast100Items(fetchAll = false) {
	if (Settings.get("general.country") === null) {
		return false; //If the country is not known, do not query
	}

	//Broadcast a new message to tell the tabs to display a loading wheel.
	sendMessageToAllTabs({ type: "newItemCheck" }, "Loading wheel");

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
				const { title, date, timestamp, asin, img_url, etv, queue, is_parent_asin, enrollment_guid } =
					response.products[i];

				//Only display notification for products with a title and image url
				//And that are more recent than the latest notification received.
				if (img_url == "" || title == "") {
					continue;
				}
				if (fetchAll || timestamp > Settings.get("notification.lastProduct")) {
					Settings.set("notification.lastProduct", timestamp);
					myStream.input({
						index: i,
						type: "newItem",
						domain: Settings.get("general.country"),
						date: date,
						asin: asin,
						title: title,
						img_url: img_url,
						etv: etv,
						queue: queue,
						is_parent_asin: is_parent_asin,
						enrollment_guid: enrollment_guid,
					});
				} else {
					//Send a message to update the ETV.
					if (etv != null) {
						sendMessageToNotificationMonitor(
							{
								type: "ETVUpdate",
								asin: asin,
								etv: etv,
							},
							"ETV notification"
						);
					}
				}
			}
			//sendMessageToAllTabs({ type: "newItemCheckEnd" }, "End of notification(s) update");
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
function keywordMatch(keywords, title) {
	return keywords.some((word) => {
		let regex;
		try {
			regex = new RegExp(`\\b${word}\\b`, "i");
		} catch (error) {
			if (error instanceof SyntaxError) {
				return false;
			}
		}

		if (regex.test(title)) {
			return true;
		}

		return false;
	});
}

async function sendMessageToNotificationMonitor(data, debugInfo) {
	try {
		broadcastChannel.postMessage(data);
	} catch (e) {
		if (DEBUG_MODE) {
			console.error("Error posting message to broadcastChannel:", e);
		}
	}
}
async function sendMessageToAllTabs(data, debugInfo) {
	//Send to the notification monitor tab
	sendMessageToNotificationMonitor(data, debugInfo);

	//Send to other tabs for the on screen notification
	if (Settings.get("notification.screen.active")) {
		try {
			const tabs = await browser.tabs.query({ currentWindow: true });
			const regex = /^.+?amazon\.([a-z.]+).*\/vine\/.*$/;
			tabs.forEach((tab) => {
				if (tab) {
					//Check to make sure this is a VineHelper tab:
					const match = regex.exec(tab.url);
					if (tab.url != undefined && match) {
						if (DEBUG_MODE) {
							//console.log("Sending message to tab " + tab.id);
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
}

function dateToUnixTimestamp(dateString) {
	const date = new Date(dateString + " UTC");

	// Get the Unix timestamp in seconds
	return Math.floor(date.getTime() / 1000);
}
