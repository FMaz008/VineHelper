const DEBUG_MODE = false; // Will always display notification even if they are not new
var appSettings = [];
var vineCountry = null;
var newItemCheckInterval = 0.5;
const broadcastChannel = new BroadcastChannel("VineHelperChannel");

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

chrome.alarms.onAlarm.addListener((alarm) => {
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

//Load the settings, if no settings, try again in 10 sec
async function init() {
	//Create an alarm task to keep the service worker alive
	//browser.alarms.create("keepAlive", { periodInMinutes: 1 }); // Adjust the interval as needed

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
				//Only display notification for product more recent than the last displayed notification
				if (getAllItems || response.products[i].date > latestProduct || latestProduct == 0) {
					//Only display notification for products with a title and image url
					if (response.products[i].img_url != "" && response.products[i].title != "") {
						if (i == 0) {
							await browser.storage.local.set({
								latestProduct: response.products[0].date,
							});
						}

						let search = response.products[i].title.replace(/^([a-zA-Z0-9\s',]{0,40})[\s]+.*$/, "$1");

						//Broadcast the notification
						console.log("Broadcasting new item " + response.products[i].asin);
						sendMessageToAllTabs(
							{
								index: i,
								type: "newItem",
								domain: vineCountry,
								date: response.products[i].date,
								asin: response.products[i].asin,
								title: response.products[i].title,
								search: search,
								img_url: response.products[i].img_url,
								etv: response.products[i].etv,
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
