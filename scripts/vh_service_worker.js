const DEBUG_MODE = false; // Will always display notification even if they are not new
const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";
const VINE_HELPER_API_V5_WS_URL = "wss://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_WS_URL = "ws://127.0.0.1:3000";

if ("function" == typeof importScripts) {
	importScripts("../scripts/SettingsMgr.js");
}

var Settings = new SettingsMgr();
var notificationsData = {};
var vineCountry = null;
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
//## PLUGIN SYSTEM
//#####################################################

//The plugin can't be run using the official release as they are bundled and can't be changed.
//Check if the manifest.json pas the scripting permission, which is the case for the github code.
//If so, activate the plugin system.
if ("function" == typeof importScripts) {
	chrome.permissions.contains({ permissions: ["scripting"] }, (result) => {
		if (result) {
			//Import plugin service workers' scripts
			importScripts("../plugins/_pluginsInit.js");
			for (let i = 0; i < ARR_PLUGIN_SERVICE_WORKERS.length; i++) {
				console.log("Importing service worker " + ARR_PLUGIN_SERVICE_WORKERS[i]);
				importScripts("../plugins/" + ARR_PLUGIN_SERVICE_WORKERS[i]);
			}

			//Import plugin content_scripts
			browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
				if (message.action === "injectPluginsContentScripts") {
					for (let i = 0; i < ARR_PLUGIN_CONTENT_SCRIPTS.length; i++) {
						// Inject the specified script into the content script context
						browser.scripting.executeScript(
							{
								target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
								files: ["plugins/" + ARR_PLUGIN_CONTENT_SCRIPTS[i]],
							},
							() => {
								if (browser.runtime.lastError) {
									console.error(browser.runtime.lastError);
								} else {
									console.log(`Imported content_script ${ARR_PLUGIN_CONTENT_SCRIPTS[i]}.`);
								}
							}
						);
					}
				}
			});
		}
	});
}

//#####################################################
//## LISTENERS
//#####################################################
browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
	/*
	if (data.type == "fetchLast100Items") {
		//Get the last 100 most recent items
		fetchLast100Items();
		sendResponse({ success: true });
	}
	*/

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

	if (alarm.name === "checkNewItems") {
		if (!Settings.get("notification.websocket") || !Settings.get("notification.active")) {
			socket?.disconnect();
		}
		if (Settings.get("notification.active")) {
			if (Settings.get("notification.websocket")) {
				connectWebSocket(); //Check the status of the websocket, reconnect if closed.
			} else {
				fetchLast100Items();
				//checkNewItems();
			}
		}
	}
});

//Websocket

if ("function" == typeof importScripts) {
	importScripts("../node_modules/socket.io/client-dist/socket.io.min.js");
}

let socket;
function connectWebSocket() {
	if (!Settings.get("notification.active") || socket?.connected) {
		/*
		if (socket?.connected) {
			console.log("ping");
			socket.emit("sendData", "ping");
		}
		*/
		//Not reconnecting to WS.
		return;
	}

	socket = io.connect(VINE_HELPER_API_V5_WS_URL, {
		query: {
			countryCode: Settings.get("general.country"),
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
		dispatchNewItem({
			index: 0,
			type: "newItem",
			domain: vineCountry,
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
	vineCountry = Settings.get("general.country");
	vineDomain = vineDomains[vineCountry];
}

async function fetchLast100Items() {
	//Broadcast a new message to tell the tabs to display a loading wheel.
	sendMessageToAllTabs({ type: "newItemCheck" }, "Loading wheel");

	const content = {
		api_version: 5,
		country: vineCountry,
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
				if (timestamp > Settings.get("notification.lastProduct")) {
					Settings.set("notification.lastProduct", timestamp);
					dispatchNewItem({
						index: i,
						type: "newItem",
						domain: vineCountry,
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
			sendMessageToAllTabs({ type: "newItemCheckEnd" }, "End of notification(s) update");
		})
		.catch(function () {
			(error) => console.log(error);
		});
}

function dispatchNewItem(data) {
	if (Settings.get("notification.hideList")) {
		const hideKWMatch = keywordMatch(Settings.get("general.hideKeywords"), data.title);
		if (hideKWMatch) {
			return; //Do not display the notification as it matches the hide list.
		}
	}

	const search = data.title.replace(/^([a-zA-Z0-9\s',]{0,40})[\s]+.*$/, "$1");
	const highlightKWMatch = keywordMatch(Settings.get("general.highlightKeywords"), data.title);

	//If the new item match a highlight keyword, push a real notification.
	if (Settings.get("notification.pushNotifications") && highlightKWMatch) {
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

		notificationsData["item-" + data.asin] = {
			asin: data.asin,
			queue: data.queue,
			is_parent_asin: data.is_parent_asin,
			enrollment_guid: data.enrollment_guid,
			search: data.search,
		};
		chrome.notifications.create(
			"item-" + data.asin,
			{
				type: "basic",
				iconUrl: data.img_url,
				title: "Vine Helper - New item match!",
				message: data.title,
				priority: 2,
			},
			(notificationId) => {
				if (chrome.runtime.lastError) {
					console.error("Notification error:", chrome.runtime.lastError);
				}
			}
		);
	}

	//Broadcast the notification
	//console.log("Broadcasting new item " + data.asin);
	sendMessageToAllTabs(
		{
			index: data.index,
			type: data.type,
			domain: vineCountry,
			date: data.date,
			timestamp: dateToUnixTimestamp(data.date),
			asin: data.asin,
			title: data.title,
			search: search,
			img_url: data.img_url,
			etv: data.etv,
			queue: data.queue,
			KWsMatch: highlightKWMatch,
			is_parent_asin: data.is_parent_asin,
			enrollment_guid: data.enrollment_guid,
		},
		"notification"
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
							console.log("Sending message to tab " + tab.id);
							console.log(tab.url);
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

function generateUUID() {
	// Public Domain/MIT
	let d = new Date().getTime(); // Timestamp
	let d2 = (performance && performance.now && performance.now() * 1000) || 0; // Time in microseconds
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
		let r = Math.random() * 16; // Random number between 0 and 16
		if (d > 0) {
			// Use timestamp until depleted
			r = (d + r) % 16 | 0;
			d = Math.floor(d / 16);
		} else {
			// Use microseconds since timestamp depleted
			r = (d2 + r) % 16 | 0;
			d2 = Math.floor(d2 / 16);
		}
		return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
	});
}

function tryParseJSON(data) {
	try {
		const parsedData = JSON.parse(data); // Try to parse the JSON string

		// Check if the parsed result is an object
		if (parsedData && typeof parsedData === "object") {
			return parsedData; // Return the parsed object
		}
	} catch (e) {
		// If JSON parsing fails, return null or handle the error
		return null;
	}

	return null; // If not JSON, return null
}

function dateToUnixTimestamp(dateString) {
	const date = new Date(dateString + " UTC");

	// Get the Unix timestamp in seconds
	return Math.floor(date.getTime() / 1000);
}
