const DEBUG_MODE = false; // Will always display notification even if they are not new
var appSettings = [];
var notificationsData = {};
var vineCountry = null;
var newItemCheckInterval = 0.5;
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

//#####################################################
//## LISTENERS
//#####################################################
browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
	if (data.type == "queryVineCountry") {
		//If we know the country, reply it
		if (vineCountry != null) {
			sendResponse({ success: true, domain: vineCountry });
			//sendMessageToAllTabs({ type: "vineCountry", domain: vineCountry }, "Vine Country - keep alive");
		}
	}
	if (data.type == "fetchLast100Items") {
		//Get the last 100 most recent items
		checkNewItems(true);
		sendResponse({ success: true });
	}
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	await retrieveSettings();

	if (alarm.name === "checkNewItems") {
		if (appSettings == undefined || !appSettings.notification.active) {
			return; //Not setup to check for notifications. Will try again in 30 secs.
		}
		checkNewItems();
	}
});

//#####################################################
//## BUSINESS LOGIC
//#####################################################

async function retrieveSettings() {
	//Obtain appSettings
	const data = await chrome.storage.local.get("settings");

	if (data == null || Object.keys(data).length === 0) {
		console.log("Settings not available yet. Waiting 10 sec...");
		setTimeout(function () {
			init();
		}, 10000);
		return; //Settings have not been initialized yet.
	} else {
		Object.assign(appSettings, data.settings);
	}

	//Set the country
	vineCountry = appSettings.general.country;
	vineDomain = vineDomains[vineCountry];
}
//Load the settings, if no settings, try again in 10 sec
async function init() {
	await retrieveSettings();

	//Check for new items (if the option is disabled the method will return)
	browser.alarms.create("checkNewItems", { periodInMinutes: newItemCheckInterval });
}

init();

async function checkNewItems(getAllItems = false) {
	let arrJSON = {
		api_version: 4,
		country: vineCountry,
		orderby: "date",
		limit: 100,
	};
	let jsonArrURL = JSON.stringify(arrJSON);

	//Broadcast a new message to tell the tabs to display a loading wheel.
	sendMessageToAllTabs({ type: "newItemCheck" }, "Loading wheel");

	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://vinehelper.ovh/vineHelperLatest.php" + "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(async function (response) {
			let latestProduct = await browser.storage.local.get("latestProduct");
			if (Object.keys(latestProduct).length === 0) {
				latestProduct = 0;
			} else {
				latestProduct = latestProduct.latestProduct;
			}

			//TODO: Client side sort the response.products array in order of response.products[i].date DESC. (most recent at the top)
			response.products.sort((a, b) => {
				const dateA = new Date(a.date);
				const dateB = new Date(b.date);
				return dateB - dateA;
			});

			for (let i = response.products.length - 1; i >= 0; i--) {
				const { title, date, asin, img_url, etv } = response.products[i];

				//Only display notification for product more recent than the last displayed notification
				if (getAllItems || date > latestProduct || latestProduct == 0) {
					//Only display notification for products with a title and image url
					if (img_url != "" && title != "") {
						if (i == 0) {
							await browser.storage.local.set({
								latestProduct: date,
							});
						}

						const search = title.replace(/^([a-zA-Z0-9\s',]{0,40})[\s]+.*$/, "$1");
						const highlightKWMatch = keywordMatch(appSettings.general.highlightKeywords, title);
						const hideKWMatch = keywordMatch(appSettings.general.hideKeywords, title);

						//If the new item match a highlight keyword, push a real notification.
						if (appSettings.notification.pushNotifications && highlightKWMatch) {
							chrome.notifications.onClicked.addListener((notificationId) => {
								chrome.tabs.create({
									url:
										"https://www.amazon." +
										vineDomain +
										"/vine/vine-items?search=" +
										notificationsData[notificationId].search,
								});
							});

							notificationsData["item-" + asin] = { search: search };
							chrome.notifications.create(
								"item-" + asin,
								{
									type: "basic",
									iconUrl: chrome.runtime.getURL("resource/image/icon-128.png"),
									title: "Vine Helper - New item match!",
									message: title,
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
						console.log("Broadcasting new item " + asin);
						sendMessageToAllTabs(
							{
								index: i,
								type: "newItem",
								domain: vineCountry,
								date: date,
								asin: asin,
								title: title,
								search: search,
								img_url: img_url,
								etv: etv,
								KWsMatch: highlightKWMatch,
								hideMatch: hideKWMatch,
							},
							"notification"
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

async function sendMessageToAllTabs(data, debugInfo) {
	//Send to the notification monitor tab
	try {
		broadcastChannel.postMessage(data);
	} catch (e) {
		if (DEBUG_MODE) {
			console.error("Error posting message to broadcastChannel:", e);
		}
	}

	//Send to other tabs for the on screen notification
	if (appSettings?.notification.screen.active) {
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
									console.log(tab);
									console.error("Error sending message to tab:", browser.runtime.lastError.message);
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
