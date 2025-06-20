/*global chrome*/

import { Internationalization } from "/scripts/core/services/Internationalization.js";
import { Item } from "/scripts/core/models/Item.js";
import {
	initializeServices,
	getSettingsManager,
	getKeywordCompilationService,
} from "/scripts/infrastructure/SettingsFactoryEnhanced.js";

// Initialize services
let Settings = null;
let keywordService = null;
let i13n = new Internationalization();
let notificationsData = {};
let masterCheckInterval = 0.2; //Firefox shutdown the background script after 30seconds.
let selectedWord = ""; // For context menu functionality

// Initialize DI services on startup
(async function initializeServiceWorker() {
	try {
		await initializeServices();
		Settings = getSettingsManager();
		keywordService = getKeywordCompilationService();

		console.log("[ServiceWorker] DI services initialized successfully");

		// Listen for keyword updates to clear cache
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (message.action === "keywordsUpdated") {
				keywordService.clearCache().then(() => {
					console.log("[ServiceWorker] Keyword cache cleared after update");
					// Re-compile keywords
					recompileKeywords();
				});
			}
		});
	} catch (error) {
		console.error("[ServiceWorker] Failed to initialize DI services:", error);
		// Fallback to compatibility mode
		const { SettingsMgr } = await import("/scripts/core/services/SettingsMgrCompat.js");
		Settings = new SettingsMgr();
	}
})();

// Helper function to recompile keywords after updates
async function recompileKeywords() {
	if (!keywordService) return;

	const keywordTypes = [
		{ key: "general.highlightKeywords", type: "highlight" },
		{ key: "general.hideKeywords", type: "hide" },
		{ key: "general.blurKeywords", type: "blur" },
	];

	for (const { key, type } of keywordTypes) {
		const keywords = (await Settings.get(key)) || [];
		if (keywords.length > 0) {
			await keywordService.compileAndShare(type, keywords);
		}
	}
}

//#####################################################
//## LISTENERS
//#####################################################

// Consolidated message handler for all runtime messages
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	// Handle broadcast messages (including pushNotification)
	if (message.type !== undefined) {
		processBroadcastMessage(message);
		return;
	}

	// Handle context menu word selection
	if (message.action === "setWord" && message.word) {
		selectedWord = message.word; // Update the selected word
		sendResponse({ success: true });
		return;
	}

	// Handle adding word to hide/highlight lists
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

			await Settings.set("general.hideKeywords", newArrHide);

			// Recompile keywords after update
			if (keywordService) {
				await keywordService.compileAndShare("hide", newArrHide);
			}

			sendResponse({ success: true });
		} else if (message.list === "Highlight") {
			const arrHighlight = await Settings.get("general.highlightKeywords");
			let newArrHighlight = [...arrHighlight, newKeyword];

			//Sort the list
			newArrHighlight.sort((a, b) => {
				if (a.contains.toLowerCase() < b.contains.toLowerCase()) return -1;
				if (a.contains.toLowerCase() > b.contains.toLowerCase()) return 1;
				return 0;
			});

			await Settings.set("general.highlightKeywords", newArrHighlight);

			// Recompile keywords after update
			if (keywordService) {
				await keywordService.compileAndShare("highlight", newArrHighlight);
			}

			sendResponse({ success: true });
		}
		return;
	}
});

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: "addToHideList",
		title: "Add to Hide List",
		contexts: ["selection"],
	});

	chrome.contextMenus.create({
		id: "addToHighlightList",
		title: "Add to Highlight List",
		contexts: ["selection"],
	});
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "addToHideList" || info.menuItemId === "addToHighlightList") {
		const list = info.menuItemId === "addToHideList" ? "Hide" : "Highlight";
		chrome.tabs.sendMessage(tab.id, { action: "addWord", word: selectedWord, list: list });
	}
});

// Alarm for master check
chrome.alarms.create("masterCheck", { periodInMinutes: masterCheckInterval });
chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name === "masterCheck") {
		sendMessageToAllTabs({ type: "masterCheck" });
	}
});

//#####################################################
//## BROADCAST MESSAGE PROCESSING
//#####################################################

function processBroadcastMessage(data) {
	if (data.type == "pushNotification") {
		try {
			// ServerCom sends { type: "pushNotification", item: {...}, title: ... }
			// where item contains all the item data from item.getAllInfo()
			if (!data.item) {
				throw new Error("pushNotification message missing item data");
			}

			const item = new Item({
				asin: data.item.asin,
				queue: data.item.queue,
				is_parent_asin: data.item.is_parent_asin,
				is_pre_release: data.item.is_pre_release,
				enrollment_guid: data.item.enrollment_guid,
			});
			item.setTitle(data.item.title);
			item.setImgUrl(data.item.img_url);
			item.setSearch(data.item.search_string);
			pushNotification(data.title, item);
		} catch (error) {
			console.error("[ServiceWorker] Cannot create item for push notification -", error.message, {
				data: data,
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
				item.setSearch(search);
				url = item.getModalUrl();
			} catch (error) {
				console.error("[ServiceWorker] Cannot create item for notification click -", error.message, {
					notificationData: notificationsData[notificationId],
					source: "notification click handler",
				});
				// Fallback to search URL
				url = search;
			}
		} else {
			url = search;
		}

		chrome.tabs.create({ url: url });
		chrome.notifications.clear(notificationId);
		delete notificationsData[notificationId];
	});
});

async function pushNotification(title, item) {
	const notificationId = `notification_${Date.now()}`;
	const iconUrl = await i13n.getURL("resource/image/icon-128.png");

	// Store notification data
	notificationsData[notificationId] = {
		asin: item.getAsin(),
		queue: item.getQueue(),
		is_parent_asin: item.getIsParentAsin(),
		enrollment_guid: item.getEnrollmentGuid(),
		search: item.getSearch(),
		is_pre_release: item.getIsPreRelease(),
	};

	chrome.notifications.create(notificationId, {
		type: "basic",
		iconUrl: iconUrl,
		title: title,
		message: item.getTitle(),
		priority: 2,
	});
}
