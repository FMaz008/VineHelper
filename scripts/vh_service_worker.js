/*global chrome*/

const channel = new BroadcastChannel("VineHelper");

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

var Settings = new SettingsMgr();
var i13n = new Internationalization();
var notificationsData = {};
var lastActivityUpdate = Date.now();
var masterMonitorTabId = null;
var masterCheckInterval = 0.2; //Firefox shutdown the background script after 30seconds.

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

chrome.runtime.onMessage.addListener(async (data, sender, sendResponse) => {
	if (["jobApplication", "thisIsMyResignationLetter"].includes(data.type)) {
		return;
	}

	sendResponse({ success: true });
	processBroadcastMessage(data);
});

//#####################################################
//## SERVICE WORKERALARMS
//#####################################################
chrome.alarms.create("pingMasterMonitor", {
	delayInMinutes: 0, // adding this to delay first run, run immediately
	periodInMinutes: masterCheckInterval,
});

//#####################################################
//## MASTER/SLAVE MONITOR HANDLING
//#####################################################

chrome.runtime.onMessage.addListener(async (data, sender, sendResponse) => {
	if (data.type == "jobApplication") {
		if (masterMonitorTabId === null) {
			masterMonitorTabId = sender.tab.id;
			console.log(
				`Received job application ${masterMonitorTabId} for the vacant master monitor position. Hiring as master monitor.`
			);
			sendResponse({ youAreTheMasterMonitor: true });
		} else {
			if (sender.tab.id == masterMonitorTabId) {
				console.log(
					`Received job application ${sender.tab.id}, but he's already assigned the job. Remind him he already works for us.`
				);
				sendResponse({ youAreTheMasterMonitor: true });
			} else {
				console.log(`Received job application ${sender.tab.id}, but the job is taken.`);
				sendResponse({ youAreTheMasterMonitor: false });
			}
		}
		return;
	}

	if (data.type == "thisIsMyResignationLetter") {
		console.log(`Master monitor gave his resignation letter. Looking for another candidate.`);

		// Start the async operation
		findMasterMonitorTab(masterMonitorTabId).then((newCandidate) => {
			if (newCandidate !== null) {
				console.log(`Demoting ${masterMonitorTabId} from master monitor to slave monitor.`);
				try {
					chrome.tabs.sendMessage(masterMonitorTabId, { type: "setSlaveMonitor" });
				} catch (error) {
					//Do nothing
				}
				masterMonitorTabId = newCandidate;
			} else {
				console.log(`No new candidate found, but master monitor might still show up to work.`);
			}
		});
	}
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	//Reload the settings
	await Settings.refresh();

	const countryCode = Settings.get("general.country");
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
	}

	if (alarm.name == "pingMasterMonitor") {
		let lastMasterMonitorTabId = null;
		if (masterMonitorTabId !== null) {
			masterMonitorTabId = await checkMasterMonitorStatus();
		}

		//Search if another monitor window is open
		if (masterMonitorTabId === null) {
			masterMonitorTabId = await findMasterMonitorTab(lastMasterMonitorTabId);
		}
	}
});

async function checkMasterMonitorStatus() {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(masterMonitorTabId, { type: "wsPing" }, (response) => {
			if (chrome.runtime.lastError) {
				if (masterMonitorTabId !== null) {
					console.log(`Master monitor ${masterMonitorTabId} quit and didn't leave a 2 weeks notice.`);
				}
				resolve(null); //Master monitor is not working with us anymore
			} else {
				//console.log(`Master monitor ${masterMonitorTabId} is still working for us.`);
				resolve(masterMonitorTabId); //Still working with us
			}
		});
	});
}

async function findMasterMonitorTab(excludingId = null) {
	const monitorTabId = await findMonitorTab(excludingId);
	if (monitorTabId) {
		//Send a message to the new master monitor tab
		return await findMasterMonitorTabHelper(monitorTabId);
	}
	return null;
}

async function findMonitorTab(excludingId = null) {
	const allTabs = await chrome.tabs.query({});
	const monitorTab = allTabs.find((tab) => tab.id !== excludingId && tab.url && tab.url.includes("#monitor"));
	if (monitorTab) {
		//Monitor tab found, return its tab id
		return monitorTab.id;
	}
	return null;
}

async function findMasterMonitorTabHelper(monitorTabId) {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(monitorTabId, { type: "setMasterMonitor" }, (response) => {
			if (chrome.runtime.lastError) {
				console.log(`Called back candidate ${monitorTabId}, no answer.`);
				resolve(null);
			} else {
				console.log(`Monitor ${monitorTabId} found, promoting it to master.`);
				resolve(monitorTabId);
			}
		});
	});
}

function sendToMasterMonitor(data) {
	chrome.tabs.sendMessage(masterMonitorTabId, data);
}

//#####################################################
//## PROCESS BROADCAST MESSAGES
//#####################################################

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

	//A notification monitor is requesting the latest items
	if (data.type == "fetchLatestItems") {
		sendToMasterMonitor({ type: "fetchLatestItems", limit: data.limit });
	}

	//Master monitor is reporting the fetch latest items
	if (data.type == "last100") {
		processLast100Items(data.products);
	}

	//Master monitor is reporting the new item
	if (data.type == "newItem") {
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
	}

	//Master monitor is reporting the new ETV
	if (data.type == "newETV") {
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
	}

	//Master monitor is reporting an unavailable item
	if (data.type == "unavailableItem") {
		sendMessageToAllTabs({
			type: "unavailableItem",
			domain: Settings.get("general.country"),
			asin: data.item.asin,
			reason: data.item.reason,
		});
	}

	//Master monitor is reporting the new variants
	if (data.type == "newVariants") {
		sendMessageToAllTabs(data, "newVariants");
	}

	//A notification monitor is requesting the websocket status.
	if (data.type == "wsStatus" && data.status == null) {
		sendToMasterMonitor({ type: "wsStatus" });
	}

	//The master monitor is reporting the websocket status.
	if (data.type == "wsStatus" && data.status !== null) {
		switch (data.status) {
			case "wsOpen":
				sendMessageToAllTabs({ type: "wsOpen" }, "Websocket server connected.");
				break;
			case "wsClosed":
				sendMessageToAllTabs({ type: "wsClosed" }, "Websocket server disconnected.");
				break;
		}
	}

	//## AUTO-LOAD #########################################################

	//A request from the master monitor to open a tab
	if (data.type == "reloadPage") {
		if (!data.queue || !data.page) {
			return false;
		}
		const queue = data.queue;
		const page = data.page;

		const queueTable = { AI: "encore", AFA: "last_chance", RFY: "potluck" };
		const url = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=${queueTable[queue]}&page=${page}#AR`;
		console.log(`${new Date().toLocaleString()} - Reloading page: ${queue} page ${page}`);

		if (Settings.get("notification.autoload.tab") && chrome.windows) {
			//Mobile devices do not support chrome.windows
			await openTab(url);
		} else {
			await fetchUrl(url, queueTable[queue]);
		}
	}

	//A tab has requested to be closed automatically.
	if (data.type == "closeARTab") {
		if (currentTabId !== null) {
			try {
				await closeTab(currentTabId);
				currentTabId = null;
			} catch (error) {
				console.error("Unexpected error closing tab:" + currentTabId, error);
			}
		}
	}

	//A tab has reported to be a dog page.
	//Tell the master monitor's auto-load timer to stop for 24 hours.
	if (data.type == "dogpage") {
		console.log("Dog page detected, halting auto-load timer for 24 hours");
		sendToMasterMonitor({ type: "dogpage" });
		resetReloadTimer(1000 * 60 * 60 * 24); //24 hours
	}

	//A tab has reported to be a captcha page.
	//Tell the master monitor's auto-load timer to stop for 1 hour.
	if (data.type == "captchapage") {
		console.log("Captcha page detected, halting auto-load timer for 1 hour");
		sendToMasterMonitor({ type: "captchapage" });
		resetReloadTimer(1000 * 60 * 60); //1 hour
	}

	//A tab has reported to be a login page.
	//Tell the master monitor's auto-load timer to stop for 1 hour.
	if (data.type == "loginpage") {
		console.log("Login page detected, halting auto-load timer for 1 hour");
		sendToMasterMonitor({ type: "loginpage" });
		resetReloadTimer(1000 * 60 * 60); //1 hour
	}
}

//#####################################################
//## AUTO-LOAD
//#####################################################

let currentTabId = null;
//Open a tab with the given url
async function openTab(url) {
	if (currentTabId !== null) {
		//Close tab id
		chrome.tabs.remove(currentTabId);
	}
	//Find the windows id containing the notification monitor with a url containing #monitor
	if (chrome.windows) {
		//Find the window containing the notification monitor
		const monitorWindowId = await findMonitorWindow(true);
		if (monitorWindowId) {
			if (typeof browser !== "undefined") {
				// Firefox
				browser.tabs
					.create({ url, windowId: monitorWindowId, active: false })
					.then((newTab) => {
						currentTabId = newTab.id;
					})
					.catch((error) => {});
			} else {
				// Chrome
				const newTab = await chrome.tabs.create({ url, windowId: monitorWindowId, active: false });
				currentTabId = newTab.id;
			}
		} else {
			console.log(`${new Date().toLocaleString()} - No monitor tab found in focus or in background, abort.`);
		}
	} else {
		console.log(`${new Date().toLocaleString()} - Tab management not supported, abort.`);
	}
}

async function findMonitorWindow(inFocusOrBackgroundOnly = false) {
	const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	const activeMonitorTab = activeTabs.find((tab) => tab.url && tab.url.includes("#monitor"));
	if (activeMonitorTab) {
		//Monitor tab found, and in focus
		return activeMonitorTab.windowId;
	} else {
		const allTabs = await chrome.tabs.query({});
		const monitorTab = allTabs.find((tab) => tab.url && tab.url.includes("#monitor"));
		if (monitorTab) {
			//Monitor tab found, but not in focus
			const window = await chrome.windows.get(monitorTab.windowId);
			if (!inFocusOrBackgroundOnly || window.state === "minimized" || !window.focused) {
				return monitorTab.windowId;
			}
		}
	}
	return false;
}

async function closeTab(tabId) {
	// Firefox requires a different approach for tab removal
	if (typeof browser !== "undefined") {
		// Firefox
		return new Promise((resolve) => {
			browser.tabs
				.get(tabId)
				.then(() => browser.tabs.remove(tabId))
				.then(() => resolve(true))
				.catch(() => resolve(false));
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
}

//Fetch the url, read the items and forward them to the server
async function fetchUrl(url, queue) {
	//Fetch the tabid of a notification monitor tab
	const allTabs = await chrome.tabs.query({});
	const notificationMonitorTab = allTabs.find((tab) => tab.url && tab.url.includes("#monitor"));
	const tabId = notificationMonitorTab ? notificationMonitorTab.id : null;

	//Send a message to the notification monitor tab to fetch the url
	if (tabId) {
		chrome.tabs.sendMessage(tabId, { type: "fetchAutoLoadUrl", url: url, queue: queue });
	}
}

//#####################################################
//## BUSINESS LOGIC
//#####################################################

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
					try {
						chrome.tabs.sendMessage(tab.id, data, (response) => {
							if (chrome.runtime.lastError) {
								//console.log(tab);
								//console.error("Error sending message to tab:", chrome.runtime.lastError.message);
							}
						});
					} catch (e) {
						console.error("Error sending message to tab:", e);
					}
				}
			}
		});
	} catch (error) {
		console.error("Error querying tabs:", error);
	}
}

//#####################################################
//## PUSH NOTIFICATIONS
//#####################################################

chrome.permissions.contains({ permissions: ["notifications"] }, (result) => {
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
});

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
		chrome.tabs.sendMessage(tab.id, { action: "copyASIN" });
		return;
	}

	if (!selectedWord) {
		console.error("No word selected!");
		return;
	}

	const list = info.menuItemId === "add-to-hideKeywords" ? "Hide" : "Highlight";

	chrome.tabs.sendMessage(tab.id, { action: "showPrompt", word: selectedWord, list: list });
});
