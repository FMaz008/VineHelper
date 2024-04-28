const DEBUG_MODE = false;
var appSettings = [];
var vineCountry = null;
const broadcastChannel = new BroadcastChannel("VineHelperChannel");

if (typeof browser === "undefined") {
	var browser = chrome;
}

//First, we need for the preboot.js file to send us the country of Vine the extension is running onto.
//Until we have that data, the service worker will standown and retry on the next pass.
browser.runtime.onMessage.addListener((data, sender, sendResponse) => {
	if (data.type == "vineCountry") {
		console.log("Received country from preboot.js: " + data.vineCountry);
		vineCountry = data.vineCountry;

		//Passing the country to the Monitor tab
		sendMessageToAllTabs({ type: "vineCountry", domain: data.vineCountry }, "Vine Country");
	}
	if (data.type == "keepAlive") {
		//console.log("Received keep alive.");
		sendResponse({ success: true });
	}
	if (data.type == "queryVineCountry") {
		//If we know the country, reply it
		if (vineCountry != null) {
			sendResponse({ success: true, domain: vineCountry });
			//sendMessageToAllTabs({ type: "vineCountry", domain: vineCountry }, "Vine Country - keep alive");
		}
	}
});

//Load the settings, if no settings, try again in 10 sec
async function init() {
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

	if (appSettings.general.newItemNotification) {
		console.log("checking for new items...");
		checkNewItems();
	}
}

init();

async function checkNewItems() {
	//Repeat another check in 60 seconds.

	if (vineCountry == null) {
		console.log("Country not received from a preboot.js yet. Waiting 10 sec...");
		setTimeout(function () {
			checkNewItems();
		}, 10000);
		return;
	}

	//Check for new items again in 30 seconds.
	setTimeout(function () {
		checkNewItems();
	}, 45000);

	if (appSettings == undefined || !appSettings.general.newItemNotification) {
		return; //Not setup to check for notifications. Will try again in 30 secs.
	}

	let arrJSON = {
		api_version: 4,
		country: vineCountry,
		orderby: "date",
		limit: 50,
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

			for (let i = response.products.length - 1; i >= 0; i--) {
				//Only display notification for product more recent than the last displayed notification
				if (DEBUG_MODE || response.products[i].date > latestProduct || latestProduct == 0) {
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
		})
		.catch(function () {
			(error) => console.log(error);
		});
}

async function sendMessageToAllTabs(data, debugInfo) {
	//Send to the notification window
	broadcastChannel.postMessage(data);

	//Send to other tabs
	if (appSettings?.general.displayNewItemNotifications) {
		browser.tabs.query({ active: true, currentWindow: true }, function (tabs) {
			const activeTab = tabs[0];
			if (activeTab) {
				browser.tabs.sendMessage(activeTab.id, data);
			}
		});
	}
}
