/*global chrome*/

import { Internationalization } from "../scripts/Internationalization.js";
import { SettingsMgr } from "../scripts/SettingsMgrCompat.js";
import { Item } from "../scripts/Item.js";

var Settings = new SettingsMgr();
var i13n = new Internationalization();
var notificationsData = {};
var masterCheckInterval = 0.2; //Firefox shutdown the background script after 30seconds.

//#####################################################
//## LISTENERS
//#####################################################

chrome.runtime.onMessage.addListener(async (data, sender, sendResponse) => {
	processBroadcastMessage(data);
});

//#####################################################
//## SERVICE WORKER KEEP ALIVE ALARM
//#####################################################
chrome.alarms.create("keepAlive", {
	delayInMinutes: 0, // adding this to delay first run, run immediately
	periodInMinutes: masterCheckInterval,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	//Reload the settings
	await Settings.refresh();

	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
	}
});

//#####################################################
//## PROCESS BROADCAST MESSAGES
//#####################################################

async function processBroadcastMessage(data) {
	if (data.type == undefined) {
		return false;
	}

	if (data.type == "pushNotification") {
		try {
			const item = new Item({
				asin: data.asin,
				queue: data.queue,
				is_parent_asin: data.is_parent_asin,
				is_pre_release: data.is_pre_release,
				enrollment_guid: data.enrollment_guid,
			});
			item.setTitle(data.title);
			item.setImgUrl(data.img_url);
			item.setSearch(data.search_string);
			pushNotification(item);
		} catch (error) {
			console.error("[ServiceWorker] Cannot create item for push notification -", error.message, {
				asin: data.asin,
				queue: data.queue,
				enrollment_guid: data.enrollment_guid,
				source: "pushNotification message",
			});
		}
	}
}

//#####################################################
//## BUSINESS LOGIC
//#####################################################

async function sendMessageToAllTabs(data) {
	try {
		const tabs = await chrome.tabs.query({});
		const regex = /^.+?amazon\.([a-z.]+).*\/vine\/.*$/;
		tabs.forEach((tab) => {
			if (tab) {
				//Check to make sure this is a VineHelper tab:
				const match = regex.exec(tab.url);
				//Edge Canari Mobile does not support tab.url
				if (tab.url == undefined || match) {
					console.log("Sending to tab id " + tab.id, data);
					sendMessageToTab(tab.id, data);
				}
			}
		});
	} catch (error) {
		console.error("Error querying tabs:", error);
	}
}

function sendMessageToTab(tabId, data) {
	//Check if the scripting permission is enabled
	chrome.permissions.contains({ permissions: ["scripting"] }, (result) => {
		if (result) {
			//Try sending message via scripting (new method, as Safari does not support tab messaging)
			try {
				chrome.scripting.executeScript({
					target: { tabId: tabId },
					func: (data) => {
						window.postMessage(data, "*");
					},
					args: [data],
				});
			} catch (e) {
				console.error("Error sending message to tab via scripting:", e);
			}
		} else {
			//Try sending a message via tab (classic method)
			try {
				chrome.tabs.sendMessage(tabId, data, (response) => {
					if (chrome.runtime.lastError) {
						console.error("Error sending message to tab:", chrome.runtime.lastError.message);
					}
				});
			} catch (e) {
				console.error("Error sending message to tab:", e);
			}
		}
	});
}

//#####################################################
//## PUSH NOTIFICATIONS
//#####################################################

chrome.permissions.contains({ permissions: ["notifications"] }, (result) => {
	chrome.notifications.onClicked.addListener((notificationId) => {
		const { asin, queue, is_parent_asin, enrollment_guid, search, is_pre_release } =
			notificationsData[notificationId];
		let url;
		if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
			try {
				const item = new Item({
					asin: asin,
					queue: queue,
					is_parent_asin: is_parent_asin,
					is_pre_release: is_pre_release,
					enrollment_guid: enrollment_guid,
				});
				const options = item.getCoreInfoWithVariant();
				url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${encodeURIComponent(JSON.stringify(options))}`;
			} catch (error) {
				console.error("[ServiceWorker] Cannot create item for notification click -", error.message, {
					asin: asin,
					queue: queue,
					enrollment_guid: enrollment_guid,
					source: "notification click handler",
				});
				// Fall back to search URL
				url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search}`;
			}
		} else {
			url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search}`;
		}
		chrome.tabs.create({
			url: url,
		});
	});
});

function pushNotification(notificationTitle, item) {
	chrome.permissions.contains({ permissions: ["notifications"] }, (result) => {
		if (result) {
			notificationsData["item-" + item.asin] = item.getAllInfo();
			chrome.notifications.create(
				"item-" + item.asin,
				{
					type: "basic",
					iconUrl: item.img_url,
					title: notificationTitle,
					message: item.getTitle(),
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

//#####################################################
//## CONTEXT MENU
//#####################################################

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
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	if (message.action === "setWord" && message.word) {
		selectedWord = message.word; // Update the selected word
		sendResponse({ success: true });
	}
	if (message.action === "addWord" && message.word) {
		const confirmedWord = message.word;

		const newKeyword = {
			contains: confirmedWord,
			without: "",
			etv_min: "",
			etv_max: "",
		};

		if (message.list === "Hide") {
			const arrHide = await Settings.get("general.hideKeywords");
			let newArrHide = [...arrHide, newKeyword];

			//Sort the list
			newArrHide.sort((a, b) => {
				if (a.contains.toLowerCase() < b.contains.toLowerCase()) return -1;
				if (a.contains.toLowerCase() > b.contains.toLowerCase()) return 1;
				return 0;
			});

			Settings.set("general.hideKeywords", newArrHide);
		} else if (message.list === "Highlight") {
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
		sendResponse({ success: true });
	}
});

// Handle context menu clicks and save the word
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "copy-asin") {
		sendMessageToTab(tab.id, { action: "copyASIN" });
		return;
	}

	if (!selectedWord) {
		console.error("No word selected!");
		return;
	}

	const list = info.menuItemId === "add-to-hideKeywords" ? "Hide" : "Highlight";

	sendMessageToTab(tab.id, { action: "showPrompt", word: selectedWord, list: list });
});
