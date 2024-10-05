const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";

//Notification arrive one at the time
//These variable allow to remember the type of notifications received
//so that when the batch end, if notification(s) were received
//the proper sound effect can be played.
var notification_added_item = false;
var notification_highlight = false;
var notification_zeroETV = false;

//const TYPE_SHOW_ALL = -1;
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;
//const TYPE_HIGHLIGHT_OR_ZEROETV = 9;

const SOUND_NONE = 0;
const SOUND_NOW = 1;
const SOUND_QUEUE = 2;
var muteLiveSound = false;

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

var Settings = new SettingsMgr();
var Tpl = new Template();
var TplMgr = new TemplateMgr();
var PinnedList = new PinnedListMgr();
var loadedTpl = null;

const vineLocales = {
	ca: { locale: "en-CA", currency: "CAD" },
	com: { locale: "en-US", currency: "USD" },
	uk: { locale: "en-GB", currency: "GBP" },
	jp: { locale: "ja-JP", currency: "JPY" },
	de: { locale: "de-DE", currency: "EUR" },
	fr: { locale: "fr-FR", currency: "EUR" },
	es: { locale: "es-ES", currency: "EUR" },
	it: { locale: "it-IT", currency: "EUR" },
};
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

var vineLocale = null;
var vineCurrency = null;
var vineDomain = null;
var Notifications = new ScreenNotifier();
const broadcastChannel = new BroadcastChannel("VineHelperChannel");

const handleReportClick = (e) => {
	e.preventDefault(); // Prevent the default click behavior
	report(e.target.dataset.asin);
};

const handleBrendaClick = (e) => {
	console.log("Branda");
	e.preventDefault();

	const asin = e.target.dataset.asin;
	const queue = e.target.dataset.queue;
	let etv = document.querySelector("#vh-notification-" + asin + " .etv_value").innerText;
	etv = Number(etv.replace(/[^0-9-.]+/g, ""));
	window.BrendaAnnounceQueue.announce(asin, etv, queue);
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

window.onload = function () {
	broadcastChannel.onmessage = async function (event) {
		let data = event.data;
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			addItem(data);
		}
		if (data.type == "ETVUpdate") {
			if (Settings.get("notification.websocket") && !muteLiveSound) {
				if (items.get(data.asin) === null) {
					console.log("ETV Update received for item " + data.asin + " @ " + data.etv);
				}
				setETV(data.asin, data.etv, SOUND_NOW);
			} else {
				setETV(data.asin, data.etv, SOUND_QUEUE); //Do not play a sound for a batch update
			}
		}

		if (data.type == "newItemCheck") {
			muteLiveSound = true;
			//Display a notification that we have checked for items.
			let note = new ScreenNotification();
			note.template = "view/notification_loading.html";
			note.lifespan = 3;
			Notifications.pushNotification(note);
		}
		if (data.type == "newItemCheckEnd") {
			if (notification_added_item) {
				playSoundAccordingToNotificationType(notification_highlight, notification_zeroETV);
			}
			notification_added_item = false;
			notification_highlight = false;
			notification_zeroETV = false;
			muteLiveSound = false;
		}

		if (data.type == "wsOpen") {
			document.getElementById("statusWS").innerHTML =
				"<strong>Server status: </strong><div class='vh-switch-32 vh-icon-switch-on'></div> Listening for notifications...";
			document.querySelector("label[for='fetch-last-100']").style.display = "block";
			document.getElementById("statusWS").style.display = "block";
			muteLiveSound = false;
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
	while (!Settings.isLoaded()) {
		await new Promise((r) => setTimeout(r, 10));
	}
	vineCountry = Settings.get("general.country");
	setLocale(vineCountry);
	loadedTpl = await Tpl.loadFile("/view/notification_monitor.html");

	if (!Settings.get("notification.active")) {
		document.getElementById("status").innerHTML =
			"<strong>Notifications disabled</strong> You need to enable the notifications for this window to work.";
	}

	//Display the date/time of the most recent item that was previously shown.
	document.getElementById("date_most_recent_item").innerText = new Date(
		Settings.get("notification.lastProduct") * 1000
	);

	if (!Settings.get("notification.websocket")) {
		document.getElementById("statusWS").style.display = "none";
		document.querySelector("label[for='fetch-last-100']").style.display = "none";
	}

	//Bind the event when changing the filter
	const filter = document.querySelector("select[name='filter-type']");
	filter.addEventListener("change", function () {
		if (filter.value == "-1") {
			//Display all notifications
			document.querySelectorAll(".vh-notification-box").forEach(function (node, key, parent) {
				node.style.display = "grid";
			});
		} else {
			//Display a specific type of notifications only
			document.querySelectorAll(".vh-notification-box").forEach(function (node, key, parent) {
				processNotificationFiltering(node);
			});
		}
	});

	//Bind fetch-last-100 button
	const btnLast100 = document.querySelector("button[name='fetch-last-100']");
	btnLast100.addEventListener("click", function () {
		if (!Settings.get("notification.websocket")) {
			console.warn("Instant notifications must be enabled for the Fetch Last 100 button to be available.");
			return false;
		}
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
	const filter = document.querySelector("select[name='filter-type']");
	const notificationType = parseInt(node.getAttribute("data-notification-type"));

	if (filter.value == -1) {
		node.style.display = "grid";
		return true;
	} else if (filter.value == 9) {
		const typesToShow = [TYPE_HIGHLIGHT, TYPE_ZEROETV];
		node.style.display = typesToShow.includes(notificationType) ? "grid" : "none";
		return typesToShow.includes(notificationType);
	} else {
		node.style.display = notificationType == filter.value ? "grid" : "none";
		return notificationType == filter.value;
	}
}

//Set the locale and currency based on the domain.
//As this is an internal page from the extension, we can only know what
//country/domain is being used when we first receive data.
async function setLocale(country) {
	if (Object.prototype.hasOwnProperty.call(vineLocales, country)) {
		vineLocale = vineLocales[country].locale;
		vineCurrency = vineLocales[country].currency;
		vineDomain = vineDomains[country];

		if (Settings.get("notification.active")) {
			document.getElementById("status").innerHTML =
				"<strong>Notification Monitor: </strong><div class='vh-switch-32 vh-icon-switch-on'></div>";
		}

		document.getElementById("date_loaded").innerText = new Date().toLocaleString(vineLocale);
	}
}

function addItem(data) {
	let { date, asin, title, search, img_url, domain, etv, queue, KWsMatch, is_parent_asin, enrollment_guid } = data;

	//If the locale is not define, set it.
	if (vineLocale == null) setLocale(domain);

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
	items.set(asin, etv);
	imageUrls.add(img_url);

	//Define the type for the template
	let type = TYPE_REGULAR;
	if (etv == "0.00") {
		type = TYPE_ZEROETV;
	}
	if (KWsMatch) {
		type = TYPE_HIGHLIGHT;
	}

	//Create the notification
	if (Settings.get("general.searchOpenModal") && is_parent_asin != null && enrollment_guid != null) {
		Tpl.setVar(
			"url",
			`https://www.amazon.${vineDomain}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin};${enrollment_guid}`
		);
	} else {
		Tpl.setVar("url", `https://www.amazon.${vineDomain}/vine/vine-items?search=${search}`);
	}

	Tpl.setVar("asin", asin);
	Tpl.setVar("is_parent_asin", is_parent_asin);
	Tpl.setVar("enrollment_guid", enrollment_guid);
	Tpl.setVar("domain", vineDomain);
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", formatDate(date));
	Tpl.setVar("search", search);
	Tpl.setVar("description", title);
	Tpl.setVar("img_url", img_url);
	Tpl.setVar("queue", queue);
	Tpl.setVar("type", type);
	Tpl.setVar("etv", ""); //We will let SetETV() handle it.
	Tpl.setIf("announce", Settings.get("discord.active") && Settings.get("discord.guid", false) != null);
	Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
	let content = Tpl.render(loadedTpl, true); //true to return a DOM object instead of an HTML string

	const newBody = document.getElementById("vh-items-container");
	newBody.prepend(content);

	//Apply the filter.
	let displayItem = processNotificationFiltering(content);

	if (displayItem) {
		notification_added_item = true;

		//Define the type of item that we found
		if (etv == "0.00") {
			notification_zeroETV = true;
		}

		//Highlight the item
		if (KWsMatch) {
			const obj = elementByAsin(asin);
			obj.style.backgroundColor = Settings.get("notification.monitor.highlight.color");
			notification_highlight = true;
		}
	}

	//Set ETV
	setETV(asin, etv, SOUND_NONE); //Do not play a sound (Instant ETV will receive an update, batch need to wait until the end)

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
		formattedETV = new Intl.NumberFormat(vineLocale, {
			style: "currency",
			currency: vineCurrency,
		}).format(etv);
	}
	return formattedETV;
}

function formatDate(date) {
	return new Date(date.replace(" ", "T") + "Z").toLocaleString(vineLocale);
}

function playSoundAccordingToNotificationType(highlightMatch = false, zeroETV = false) {
	let volume, filename;

	//Highlight notification
	volume = Settings.get("notification.monitor.highlight.volume");
	filename = Settings.get("notification.monitor.highlight.sound");
	if (highlightMatch && filename != "0" && volume > 0) {
		playSound(filename, volume);
		return true;
	}

	//Zero ETV notification
	volume = Settings.get("notification.monitor.zeroETV.volume");
	filename = Settings.get("notification.monitor.zeroETV.sound");
	if (zeroETV && filename != "0" && volume > 0) {
		playSound(filename, volume);
		return true;
	}

	//Regular notification
	volume = Settings.get("notification.monitor.regular.volume");
	filename = Settings.get("notification.monitor.regular.sound");
	if (filename != "0" && volume > 0) {
		playSound(filename, volume);
		return true;
	}

	return false;
}

function playSound(filename, volume) {
	const audioElement = new Audio(browser.runtime.getURL("resource/sound/" + filename + ".mp3"));
	const handleEnded = () => {
		audioElement.removeEventListener("ended", handleEnded); // Remove the event listener
		audioElement.remove(); // Remove the audio element from the DOM
	};
	audioElement.addEventListener("ended", handleEnded);
	if (volume >= 0 && volume <= 1) {
		audioElement.volume = Number(volume);
	}
	audioElement.play();
}

function itemID(asin) {
	return `vh-notification-${asin}`;
}

function elementByAsin(asin) {
	return document.getElementById(itemID(asin));
}

function setETV(asin, etv, immediatelyPlaySound) {
	const obj = elementByAsin(asin);
	if (!obj) {
		return false; //This notification does not exist.
	}
	const etvObj = obj.querySelector(".etv_value");

	if (etvObj.innerText == "" && etv == "0.00") {
		//If ETV changed from none to "0.00", trigger a sound and bring it to the top
		if (immediatelyPlaySound == SOUND_NOW) {
			playSoundAccordingToNotificationType(false, true);
		}
		if (immediatelyPlaySound == SOUND_QUEUE) {
			notification_added_item = true;
			notification_zeroETV = true;
		}

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
	if (etv == null) {
		etvObj.style.display = "none";

		if (brendaAnnounce) {
			brendaAnnounce.style.visibility = "hidden";
		}
	} else {
		etvObj.style.display = "inline-block";
		etvObj.innerText = formatETV(etv);
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
		country: vineDomain,
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
