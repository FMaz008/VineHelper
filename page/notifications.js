const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";

//const TYPE_SHOW_ALL = -1;
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;
const TYPE_HIGHLIGHT_OR_ZEROETV = 9;

if (typeof browser === "undefined") {
	var browser = chrome;
}

//Required for the Template engine but not of any use in this script.
var arrDebug = [];
const items = new Map(); //Store ASIN => etv
const imageUrls = new Set();

var startTime = Date.now();
function showRuntime(eventName) {
	arrDebug.push({ time: Date.now() - startTime, event: eventName });
}
function showDebug() {
	console.log(JSON.stringify(arrDebug));
}

import { SettingsMgr } from "../scripts/SettingsMgr.js";
window.Settings = new SettingsMgr();
import { Internationalization } from "../scripts/Internationalization.js";
window.I13n = new Internationalization();
import { NotificationsSoundPlayer } from "../scripts/NotificationsSoundPlayer.js";
var notificationsSoundPlayer = new NotificationsSoundPlayer();

window.Tpl = new Template();
window.TplMgr = new TemplateMgr();
window.Notifications = new ScreenNotifier();
window.PinnedList = new PinnedListMgr();

var loadedTpl = null;

var feedPaused = false;

const broadcastChannel = new BroadcastChannel("VineHelperChannel");

//Load custom CSS
function loadStyleSheetContent(content, path = "injected") {
	if (content != "") {
		const style = document.createElement("style");
		style.innerHTML = "/*" + path + "*/\n" + content;
		document.head.appendChild(style);
	}
}

const handleReportClick = (e) => {
	e.preventDefault(); // Prevent the default click behavior
	report(e.target.dataset.asin);
};

const handleBrendaClick = (e) => {
	console.log("Brenda");
	e.preventDefault();

	const asin = e.target.dataset.asin;
	const queue = e.target.dataset.queue;
	let etv = document.querySelector("#vh-notification-" + asin + " .etv_value").innerText;
	// In case of price range, only send the highest value
	etv = etv.split("-").pop();
	etv = Number(etv.replace(/[^0-9-.]+/g, ""));
	window.BrendaAnnounceQueue.announce(asin, etv, queue, I13n.getDomainTLD());
};

const handlePinClick = (e) => {
	e.preventDefault();

	const asin = e.target.dataset.asin;
	const isParentAsin = e.target.dataset.isParentAsin;
	const enrollmentGUID = e.target.dataset.enrollmentGuid;
	const queue = e.target.dataset.queue;
	const title = e.target.dataset.title;
	const thumbnail = e.target.dataset.thumbnail;

	PinnedList.addItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID);

	//Display notification
	Notifications.pushNotification(
		new ScreenNotification({
			title: `Item ${asin} pinned.`,
			lifespan: 3,
			content: title,
		})
	);
};

const handleHideClick = (e) => {
	e.preventDefault();

	const asin = e.target.dataset.asin;
	items.delete(asin);
	elementByAsin(asin).remove();
};

const handlePauseFeedClick = (e) => {
	feedPaused = !feedPaused;
	if (feedPaused) {
		document.getElementById("pauseFeed").value = "Resume Feed";
	} else {
		document.getElementById("pauseFeed").value = "Pause & Buffer Feed";
		document.querySelectorAll(".vh-notification-box").forEach(function (node, key, parent) {
			if (node.dataset.feedPaused == "true") {
				node.style.display = "grid";
				node.dataset.feedPaused = "false";
			}
		});
	}
};
window.onload = function () {
	broadcastChannel.onmessage = async function (event) {
		let data = event.data;
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			addItem(data);
		}
		if (data.type == "ETVUpdate") {
			if (items.get(data.asin) === null) {
				console.log("ETV Update received for item " + data.asin + " @ " + data.etv);
			}

			setETV(data.asin, data.etv, data.etv);
		}

		if (data.type == "newItemCheck") {
			//Display a notification that we have checked for items.
			let note = new ScreenNotification();
			note.template = "view/notification_loading.html";
			note.lifespan = 3;
			Notifications.pushNotification(note);
		}

		if (data.type == "wsOpen") {
			document.getElementById("statusWS").innerHTML =
				"<strong>Server status: </strong><div class='vh-switch-32 vh-icon-switch-on'></div> Listening for notifications...";
			document.querySelector("label[for='fetch-last-100']").style.display = "inline-block";
			document.getElementById("statusWS").style.display = "block";
		}
		if (data.type == "wsClosed") {
			document.getElementById("statusWS").innerHTML =
				"<strong>Server status: </strong><div class='vh-switch-32 vh-icon-switch-off'></div> Not connected. Retrying in 30 sec.";
			document.querySelector("label[for='fetch-last-100']").style.display = "none";
		}
	};

	//Clear the debug log every 30 minutes to save memory usage.
	setInterval(
		async () => {
			arrDebug = [];
		},
		30 * 60 * 1000
	);

	init();
};

async function init() {
	//Wait for the settings to be loaded.
	while (!Settings || !Settings.isLoaded()) {
		await new Promise((r) => setTimeout(r, 10));
	}
	const domainTLD = Settings.get("general.country");
	I13n.setDomainTLD(domainTLD);
	loadLocale();

	loadedTpl = await Tpl.loadFile("/view/notification_monitor.html");

	if (Settings.get("general.customCSS")) {
		loadStyleSheetContent(Settings.get("general.customCSS"));
	}

	if (!Settings.get("notification.active")) {
		document.getElementById("status").innerHTML =
			"<strong>Notifications disabled</strong> You need to enable the notifications for this window to work.";
	}

	//Display the date/time of the most recent item that was previously shown.
	document.getElementById("date_most_recent_item").innerText = new Date(
		Settings.get("notification.lastProduct") * 1000
	);

	//Bind the event when changing the filter
	const filterType = document.querySelector("select[name='filter-type']");
	filterType.addEventListener("change", function () {
		//Display a specific type of notifications only
		document.querySelectorAll(".vh-notification-box").forEach(function (node, key, parent) {
			processNotificationFiltering(node);
		});
	});
	const filterQueue = document.querySelector("select[name='filter-queue']");
	filterQueue.addEventListener("change", function () {
		//Display a specific type of notifications only
		document.querySelectorAll(".vh-notification-box").forEach(function (node, key, parent) {
			processNotificationFiltering(node);
		});
	});

	//Bind Pause Feed button
	const btnPauseFeed = document.getElementById("pauseFeed");
	btnPauseFeed.addEventListener("click", handlePauseFeedClick);

	//Bind fetch-last-100 button
	const btnLast100 = document.querySelector("button[name='fetch-last-100']");
	btnLast100.addEventListener("click", function () {
		browser.runtime.sendMessage(
			{
				type: "fetchLast100Items",
			},
			function (response) {
				if (browser.runtime.lastError) {
					console.error("Error sending message:", browser.runtime.lastError.message);
				}
			}
		);
	});

	//Obtain the status of the WebSocket connection.
	browser.runtime.sendMessage({
		type: "wsStatus",
	});
}

//Function to determine if the notification has to be displayed base on the filtering option.
function processNotificationFiltering(node) {
	if (!node) {
		return false;
	}
	const filterType = document.querySelector("select[name='filter-type']");
	const notificationType = parseInt(node.getAttribute("data-notification-type"));
	const filterQueue = document.querySelector("select[name='filter-queue']");
	const queueType = node.getAttribute("data-queue");

	//Feed Paused
	if (node.dataset.feedPaused == "true") {
		node.style.display = "none";
		return false;
	}

	if (filterType.value == -1) {
		node.style.display = "grid";
	} else if (filterType.value == TYPE_HIGHLIGHT_OR_ZEROETV) {
		const typesToShow = [TYPE_HIGHLIGHT, TYPE_ZEROETV];
		node.style.display = typesToShow.includes(notificationType) ? "grid" : "none";
		typesToShow.includes(notificationType);
	} else {
		node.style.display = notificationType == filterType.value ? "grid" : "none";
		notificationType == filterType.value;
	}

	if (node.style.display == "grid") {
		if (filterQueue.value == "-1") {
			return true;
		} else {
			node.style.display = queueType == filterQueue.value ? "grid" : "none";
			return queueType == filterQueue.value;
		}
	} else {
		return false;
	}
}

//Set the locale and currency based on the domain.
async function loadLocale() {
	if (I13n.getCountryCode() === null) {
		document.getElementById("status").innerHTML =
			"<strong>Notification Monitor: </strong><div class='vh-switch-32 vh-icon-switch-off'> Your country has not been detected, ensure to load a vine page before using the notification monitor.</div>";
	} else if (I13n.getDomainTLD() === null) {
		document.getElementById("status").innerHTML =
			"<strong>Notification Monitor: </strong><div class='vh-switch-32 vh-icon-switch-off'> No valid country found. You current country is detected as: '" +
			I13n.getCountryCode() +
			"', which is not currently supported by Vine Helper. Reach out so we can add it!";
	} else if (Settings.get("notification.active")) {
		document.getElementById("status").innerHTML =
			"<strong>Notification Monitor: </strong><div class='vh-switch-32 vh-icon-switch-on'></div>";
	}

	document.getElementById("date_loaded").innerText = new Date().toLocaleString(I13n.getLocale());
}

function addItem(data) {
	let {
		date,
		asin,
		title,
		search,
		img_url,
		etv_min,
		etv_max,
		queue,
		KWsMatch,
		BlurKWsMatch,
		is_parent_asin,
		enrollment_guid,
	} = data;

	//If the item already exist, do not display it again
	if (items.has(asin)) {
		return false;
	}

	//If the item has a duplicate thumbnail, hide it (if the option is enabled)
	if (Settings.get("notification.monitor.hideDuplicateThumbnail") && imageUrls.has(img_url)) {
		showRuntime("NOTIFICATION: item " + asin + " has a duplicate image and won't be shown.");
		return;
	}

	//New item to be added
	console.log("Adding item " + asin);
	items.set(asin, etv_min);
	imageUrls.add(img_url);

	//Define the type for the template
	let type = TYPE_REGULAR;
	if (etv_min == "0.00") {
		type = TYPE_ZEROETV;
	}
	if (KWsMatch) {
		type = TYPE_HIGHLIGHT;
	}

	//Create the notification
	if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
		Tpl.setVar(
			"url",
			`https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`
		);
	} else {
		Tpl.setVar("url", `https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?search=${search}`);
	}

	Tpl.setVar("asin", asin);
	Tpl.setVar("is_parent_asin", is_parent_asin);
	Tpl.setVar("enrollment_guid", enrollment_guid);
	Tpl.setVar("domain", I13n.getDomainTLD());
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", formatDate(date));
	Tpl.setVar("search", search);
	Tpl.setVar("description", title);
	Tpl.setVar("img_url", img_url);
	Tpl.setVar("queue", queue);
	Tpl.setVar("type", type);
	Tpl.setVar("feedPaused", feedPaused);
	Tpl.setIf("announce", Settings.get("discord.active") && Settings.get("discord.guid", false) != null);
	Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
	Tpl.setIf("variant", Settings.get("general.displayVariantIcon") && is_parent_asin);

	let content = Tpl.render(loadedTpl, true); //true to return a DOM object instead of an HTML string
	const newBody = document.getElementById("vh-items-container");
	newBody.prepend(content);

	//Apply the filter.
	let displayItem = processNotificationFiltering(content);
	if (displayItem) {
		notificationsSoundPlayer.play(type);
	}
	//Highlight the item
	if (KWsMatch) {
		const obj = elementByAsin(asin);
		obj.style.backgroundColor = Settings.get("notification.monitor.highlight.color");
	}

	//Blur the item
	if (BlurKWsMatch) {
		const obj = elementByAsin(asin);
		obj.querySelector(".vh-img-container>img")?.classList.add("blur");
		obj.querySelector(".vh-notification-content>div>a")?.classList.add("dynamic-blur");
	}

	//Set ETV
	setETV(asin, etv_min, etv_max); //Do not play a sound (Instant ETV will receive an update, batch need to wait until the end)

	// Add new click listener for the report button
	document.querySelector("#vh-notification-" + asin + " .report-link").addEventListener("click", handleReportClick);

	//Add new click listener for Brenda announce:
	if (Settings.get("discord.active") && Settings.get("discord.guid", false) != null) {
		const announce = document.querySelector("#vh-announce-link-" + asin);
		announce.addEventListener("click", handleBrendaClick);
	}

	//Add new click listener for the pinned button
	if (Settings.get("pinnedTab.active")) {
		const pinIcon = document.querySelector("#vh-pin-link-" + asin);
		pinIcon.addEventListener("click", handlePinClick);
	}

	//Add new click listener for the hide button
	const hideIcon = document.querySelector("#vh-hide-link-" + asin);
	hideIcon.addEventListener("click", handleHideClick);

	//Update the most recent date
	document.getElementById("date_most_recent_item").innerText = formatDate(date);

	//Auto truncate
	if (document.getElementById("auto-truncate").checked) {
		const itemsD = document.getElementsByClassName("vh-notification-box");
		const itemsCount = itemsD.length;
		if (itemsCount > 2000) {
			for (let i = itemsCount - 1; i >= 2000; i--) {
				const asin = itemsD[i].dataset.asin;
				items.delete(asin);
				itemsD[i].remove(); //remove the element from the DOM
				console.log("Truncating " + asin);
			}
		}
	}
}

//Prepare the ETV to be displayed
function formatETV(etv) {
	let formattedETV = "";
	if (etv != null) {
		formattedETV = new Intl.NumberFormat(I13n.getLocale(), {
			style: "currency",
			currency: I13n.getCurrency(),
		}).format(etv);
	}
	return formattedETV;
}

function formatDate(date) {
	return new Date(date.replace(" ", "T") + "Z").toLocaleString(I13n.getLocale());
}

function itemID(asin) {
	return `vh-notification-${asin}`;
}

function elementByAsin(asin) {
	return document.getElementById(itemID(asin));
}

function setETV(asin, etv_min, etv_max) {
	const obj = elementByAsin(asin);
	if (!obj) {
		return false; //This notification does not exist.
	}
	const etvObj = obj.querySelector(".etv_value");

	if (etvObj.innerText == "" && etv_min == "0.00") {
		//If ETV changed from none to "0.00", trigger a sound and bring it to the top
		notificationsSoundPlayer.play(TYPE_ZEROETV);

		//Highlight for ETV
		obj.style.backgroundColor = Settings.get("notification.monitor.zeroETV.color");
		if (obj.getAttribute("data-notification-type") != TYPE_HIGHLIGHT) {
			obj.setAttribute("data-notification-type", TYPE_ZEROETV);
		}

		//Move the notification to the top
		const container = document.getElementById("vh-items-container");
		container.insertBefore(obj, container.firstChild);

		//Run the filter on the item
		processNotificationFiltering(obj);
	}

	//Remove ETV Value and Brenda announce icon if it does not exist
	let brendaAnnounce = document.querySelector("#vh-announce-link-" + asin);
	if (etv_min == null) {
		etvObj.style.display = "none";

		if (brendaAnnounce) {
			brendaAnnounce.style.visibility = "hidden";
		}
	} else {
		etvObj.style.display = "inline-block";

		//Update product ETV
		if (obj.dataset.etvMin == "" || obj.dataset.etvMin > etv_min) {
			obj.dataset.etvMin = etv_min;
		}
		if (obj.dataset.etvMax == "" || obj.dataset.etvMax < etv_max) {
			obj.dataset.etvMax = etv_max;
		}

		//Display ETV
		if (obj.dataset.etvMin == obj.dataset.etvMax) {
			etvObj.innerText = formatETV(obj.dataset.etvMin);
		} else {
			etvObj.innerText = formatETV(obj.dataset.etvMin) + "-" + formatETV(obj.dataset.etvMax);
		}
		if (brendaAnnounce) {
			brendaAnnounce.style.visibility = "visible";
		}
	}
}

function report(asin) {
	let val = prompt(
		"Are you sure you want to REPORT the user who posted ASIN#" +
			asin +
			"?\n" +
			"Only report notifications which are not Amazon products\n" +
			"Note: False reporting may get you banned.\n\n" +
			"type REPORT in the field below to send a report:"
	);
	if (val !== null && val.toLowerCase() == "report") {
		send_report(asin);
	}
	return false;
}

function send_report(asin) {
	let manifest = chrome.runtime.getManifest();

	const content = {
		api_version: 5,
		app_version: manifest.version,
		country: I13n.getCountryCode(),
		action: "report_asin",
		uuid: Settings.get("general.uuid", false),
		asin: asin,
	};
	const options = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	};

	showRuntime("Sending report...");

	//Send the report to VH's server
	fetch(VINE_HELPER_API_V5_URL, options)
		.then(report_sent)
		.catch(function () {
			showRuntime(error);
		});
}

function report_sent() {
	alert("Report sent. Thank you.");
}
