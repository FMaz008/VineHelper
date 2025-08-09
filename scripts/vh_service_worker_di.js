/*global chrome*/

import { Internationalization } from "/scripts/core/services/Internationalization.js";
import { Item } from "/scripts/core/models/Item.js";
import { initializeServices, getSettingsManager } from "/scripts/infrastructure/SettingsFactoryEnhanced.js";

// Initialize services
let Settings = null;
let i13n = new Internationalization();
let notificationsData = {};
let masterCheckInterval = 0.2; //Firefox shutdown the background script after 30seconds.
let selectedWord = ""; // For context menu functionality

// Initialize DI services on startup
(async function initializeServiceWorker() {
	try {
		await initializeServices();
		Settings = getSettingsManager();

		console.log("[ServiceWorker] DI services initialized successfully");

		// Listen for keyword updates to clear cache
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (message.action === "keywordsUpdated") {
				// Clear keyword cache in settings manager
				if (Settings.clearKeywordCache) {
					Settings.clearKeywordCache();
					console.log("[ServiceWorker] Keyword cache cleared after update");
				}
			}
		});
	} catch (error) {
		console.error("[ServiceWorker] Failed to initialize DI services:", error);
		// Service workers cannot recover from this error - DI is required
		throw error;
	}
})();

// Removed old keyword caching functions - now handled by SettingsMgrDI

// NOTE: Keywords in the service worker are NOT mission-critical
// The service worker only uses keywords for:
// 1. Adding new keywords via context menu (right-click)
// 2. Clearing keyword cache when keywords are updated
// All actual keyword matching happens in content scripts and the notification monitor
// If the service worker goes offline, keyword functionality continues to work

//#####################################################
//## LISTENERS
//#####################################################

// Consolidated message handler for all runtime messages
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
	// Handle broadcast messages (including pushNotification)
	if (message.type !== undefined) {
		processBroadcastMessage(message, sender, sendResponse);
		return true; // Indicate that sendResponse will be called asynchronously
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
			// Keywords are now automatically compiled by SettingsMgrDI

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
			// Keywords are now automatically compiled by SettingsMgrDI

			sendResponse({ success: true });
		}
		return;
	}
});

//#####################################################
//## CONTEXT MENU
//#####################################################

chrome.permissions.contains({ permissions: ["contextMenus"] }, (result) => {
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
});

//#####################################################
//## BROADCAST MESSAGE PROCESSING
//#####################################################

function processBroadcastMessage(data, sender, sendResponse) {
	if (data.type == "saveToLocalStorage") {
		chrome.storage.local.set(
			{
				[data.key]: data.value,
			},
			() => {
				if (chrome.runtime.lastError) {
					// Send error response
					const error = chrome.runtime.lastError.message;
					const errorName = error.includes("quota") ? "QuotaExceededError" : "StorageError";
					sendResponse({
						success: false,
						error: error,
						errorName: errorName,
					});
				} else {
					// Send success response
					sendResponse({ success: true });
				}
			}
		);
		return true; // Indicate that sendResponse will be called asynchronously
	}

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
					if (Settings.get("general.debugServiceWorker")) {
						console.log("Sending to tab id " + tab.id, data);
					}
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
		if (Settings.get("general.debugServiceWorker")) {
			console.log("[ServiceWorker] Notification clicked", {
				notificationId,
				data: notificationsData[notificationId],
			});
		}

		const { asin, queue, is_parent_asin, enrollment_guid, search, is_pre_release } =
			notificationsData[notificationId] || {};

		let url;
		const domain = Settings.get("general.country") || "com";

		// Check if we should open modal (requires all necessary data)
		if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
			try {
				// Create the openModal URL like the old code did
				const item = new Item({
					asin: asin,
					queue: queue,
					is_parent_asin: is_parent_asin,
					is_pre_release: is_pre_release,
					enrollment_guid: enrollment_guid,
				});
				const options = item.getCoreInfoWithVariant();
				url = `https://www.amazon.${domain}/vine/vine-items?queue=encore#openModal;${encodeURIComponent(JSON.stringify(options))}`;
				if (Settings.get("general.debugServiceWorker")) {
					console.log("[ServiceWorker] Opening modal URL:", url);
				}
			} catch (error) {
				console.error("[ServiceWorker] Cannot create modal URL, falling back to search", error);
				// Fall back to search URL
				if (search) {
					url = `https://www.amazon.${domain}/vine/vine-items?search=${encodeURIComponent(search)}`;
				}
			}
		} else if (search) {
			// Use search string (item title) not ASIN
			url = `https://www.amazon.${domain}/vine/vine-items?search=${encodeURIComponent(search)}`;
		} else {
			// Last resort: just open vine items page
			url = `https://www.amazon.${domain}/vine/vine-items`;
			console.warn("[ServiceWorker] No search string available for notification", {
				notificationData: notificationsData[notificationId],
			});
		}

		if (Settings.get("general.debugServiceWorker")) {
			console.log("[ServiceWorker] Opening URL from notification click:", url);
		}
		chrome.tabs.create({ url: url });
		chrome.notifications.clear(notificationId);
		delete notificationsData[notificationId];
	});
});

async function pushNotification(title, item) {
	// Handle both object with methods and plain object formats
	// If item is an Item instance, get the data from getAllInfo()
	const itemData = item.getAllInfo ? item.getAllInfo() : item;

	// Use ASIN-based notification ID to prevent duplicates
	const notificationId = `notification_${itemData.asin}`;
	const iconUrl = chrome.runtime.getURL("resource/image/icon-128.png");

	// Store notification data
	notificationsData[notificationId] = {
		asin: itemData.asin,
		queue: itemData.queue,
		is_parent_asin: itemData.is_parent_asin,
		enrollment_guid: itemData.enrollment_guid,
		search: itemData.search,
		is_pre_release: itemData.is_pre_release,
	};

	// Get the product image URL if available
	const imageUrl = itemData.img_url;

	// Debug logging for notification images
	if (Settings.get("general.debugServiceWorker")) {
		console.log("[ServiceWorker] Notification image data", {
			asin: itemData.asin,
			title: itemData.title,
			imageUrl: imageUrl,
			hasImgUrl: !!itemData.img_url,
			itemDataKeys: Object.keys(itemData),
			fullItemData: itemData,
		});

		if (!imageUrl) {
			console.warn("[ServiceWorker] No image URL for notification");
		}
	}

	const notificationOptions = {
		type: "basic",
		iconUrl: imageUrl || iconUrl, // Use product image as icon if available, fallback to extension icon
		title: title,
		message: itemData.title || "",
		priority: 2,
		silent: false,
	};

	if (Settings.get("general.debugServiceWorker")) {
		console.log("[ServiceWorker] Creating notification", {
			asin: itemData.asin,
			type: notificationOptions.type,
			iconUrl: notificationOptions.iconUrl,
			hasProductImage: !!imageUrl,
		});
	}

	chrome.notifications.create(notificationId, notificationOptions);
}
