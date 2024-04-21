var lastSoundPlayedAt = 0; //Date.now();
var appSettings = [];
if (typeof browser === "undefined") {
	var browser = chrome;
}

//Required for the Template engine but not of any use in this script.
var arrDebug = [];
const items = new Map();
const imageUrls = new Set();

var startTime = Date.now();
function showRuntime(eventName) {
	arrDebug.push({ time: Date.now() - startTime, event: eventName });
}
function showDebug() {
	console.log(JSON.stringify(arrDebug));
}

var Tpl = new Template();
var TplMgr = new TemplateMgr();
var loadedTpl = null;

const vineLocales = {
	ca: { locale: "en-CA", currency: "CAD" },
	com: { locale: "en-US", currency: "USD" },
	uk: { locale: "en-GB", currency: "GBP" },
	jp: { locale: "ja-JP", currency: "JPY" },
	de: { locale: "de-DE", currency: "EUR" },
	fr: { locale: "fr-FR", currency: "EUR" },
	es: { locale: "es-ES", currency: "EUR" },
};
const vineDomains = {
	ca: "ca",
	com: "com",
	uk: "co.uk",
	jp: "co.jp",
	de: "de",
	fr: "fr",
	es: "es",
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

window.onload = function () {
	broadcastChannel.onmessage = async function (event) {
		let data = event.data;
		if (data.type == undefined) return;

		if (data.type == "newItem") {
			addItem(data);
		}
		if (data.type == "newItemCheck") {
			//Display a notification that we have checked for items.
			let note = new ScreenNotification();
			note.template = "view/notification_loading.html";
			note.lifespan = 3;
			Notifications.pushNotification(note);
		}
		if (data.type == "vineCountry") {
			if (vineDomain === null) {
				setLocale(data.domain);
			}
		}
	};

	//Send keep alive message every 25 secs to keep the service worker alive.
	setInterval(async () => {
		browser.runtime.sendMessage({
			type: "keepAlive",
		});
	}, 25000);

	//Clear the debug log every 30 minutes to save memory usage.
	setInterval(
		async () => {
			arrDebug = [];
		},
		30 * 60 * 1000
	);

	document.getElementById("date_loaded").innerText = new Date();
	init();
};

async function init() {
	const data = await browser.storage.local.get("settings");

	loadedTpl = await Tpl.loadFile("/view/notification_monitor.html");

	if (data == null || Object.keys(data).length === 0) {
		showRuntime("Settings not available yet. Waiting 10 sec...");
		setTimeout(function () {
			init();
		}, 10000);
		return; //Settings have not been initialized yet.
	} else {
		Object.assign(appSettings, data.settings);
	}

	if (!appSettings.general.newItemNotification) {
		document.getElementById("status").innerHTML =
			"<strong>Notifications disabled</strong> You need to enable the notifications for this window to work.";
	}

	//Ask the service worker if the country is known.
	browser.runtime.sendMessage(
		{
			type: "queryVineCountry",
		},
		function (response) {
			if (response?.domain !== undefined) {
				setLocale(response.domain);
			}
		}
	);
}

//Set the locale and currency based on the domain.
//As this is an internal page from the extension, we can only know what
//country/domain is being used when we first receive data.
function setLocale(country) {
	if (Object.prototype.hasOwnProperty.call(vineLocales, country)) {
		vineLocale = vineLocales[country].locale;
		vineCurrency = vineLocales[country].currency;
		vineDomain = vineDomains[country];

		if (appSettings != undefined && appSettings.general.newItemNotification) {
			document.getElementById("status").innerHTML = "<strong>Active</strong> Listening for notifications...";
		}
	}
}

function addItem(data) {
	let { date, asin, title, search, img_url, domain, etv } = data;
	let { hideKeywords, highlightKeywords, newItemMonitorNotificationHiding, newItemMonitorDuplicateImageHiding } =
		appSettings.general;

	//If the locale is not define, set it.
	if (vineLocale == null) setLocale(domain);

	if (newItemMonitorDuplicateImageHiding && imageUrls.has(img_url)) {
		showRuntime("NOTIFICATION: item " + asin + " has a duplicate image and won't be shown.");
		return;
	}

	let shouldHighlight = keywordMatch(highlightKeywords, title);
	if (shouldHighlight)
		showRuntime("NOTIFICATION: item " + asin + " match the highlight list and will be highlighed.");

	if (!shouldHighlight && newItemMonitorNotificationHiding && keywordMatch(hideKeywords, title)) {
		showRuntime("NOTIFICATION: item " + asin + " match the hidden list and won't be shown.");
		return;
	}

	if (items.has(asin)) {
		//Item already exist, update ETV
		("checking etv");
		if (etv != items.get(asin)) {
			setETV(asin, etv);
		}
	} else {
		//New item to be added
		items.set(asin, etv);
		imageUrls.add(img_url);
		playSoundIfEnabled();

		Tpl.setVar("id", asin);
		Tpl.setVar("domain", vineDomain);
		Tpl.setVar("title", "New item");
		Tpl.setVar("date", formatDate(date));
		Tpl.setVar("search", search);
		Tpl.setVar("asin", asin);
		Tpl.setVar("description", title);
		Tpl.setVar("img_url", img_url);
		Tpl.setVar("etv", formatETV(etv));
		Tpl.setIf("shouldHighlight", shouldHighlight);
		let content = Tpl.render(loadedTpl, true); //true to return a DOM object instead of an HTML string

		const newBody = document.getElementById("vh-items-container");
		newBody.prepend(content);

		// Add new click listener for the report button
		document
			.querySelector("#vh-notification-" + asin + " .report-link")
			.addEventListener("click", handleReportClick);
		setETV(asin, etv);
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
	return new Date(date + " GMT").toLocaleString(vineLocale);
}

function playSoundIfEnabled() {
	if (appSettings.general.newItemMonitorNotificationSound) {
		if (Date.now() - lastSoundPlayedAt > 30000) {
			// Don't play the notification sound again within 30 sec.
			lastSoundPlayedAt = Date.now();
			const audioElement = new Audio(browser.runtime.getURL("resource/sound/notification.mp3"));
			audioElement.addEventListener("ended", function () {
				// Remove the audio element from the DOM
				audioElement.removeEventListener("ended", arguments.callee); // Remove the event listener
				audioElement.remove();
			});
			audioElement.play();
		}
	}
}

function itemID(asin) {
	return `vh-notification-${asin}`;
}

function elementByAsin(asin) {
	return document.getElementById(itemID(asin));
}

function setETV(asin, etv) {
	const etvClass = elementByAsin(asin);

	//Highlight for ETV
	if (etv == "0.00") {
		etvClass.classList.add("zeroETV");
	}
	//Remove ETV Value if it does not exist
	let etvElement = document.querySelector("#" + itemID(asin) + " .etv_value");
	if (etv == null) {
		etvElement.style.display = "none";
	} else {
		etvElement.innerText = etv;
	}
}

function keywordMatch(keywords, title) {
	return keywords.some((word) => {
		let regex;
		try {
			regex = new RegExp(`\\b${word}\\b`, "i");
		} catch (error) {
			if (error instanceof SyntaxError) {
				showRuntime("NOTIFICATION: The keyword '" + word + "' is not a valid regular expression, skipping it.");
			}
		}

		if (regex.test(title)) {
			showRuntime("Matched keyword: " + word + " for title " + title);
			return true;
		}

		return false;
	});
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
	let arrJSON = {
		api_version: 4,
		app_version: manifest.version,
		asin: asin,
		action: "report_asin",
		country: vineDomain,
		uuid: appSettings.general.uuid,
	};
	let jsonArrURL = JSON.stringify(arrJSON);

	showRuntime("Sending report...");

	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;

	fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	})
		.then(report_sent)
		.catch(function () {
			showRuntime(error);
		});
}

function report_sent() {
	alert("Report sent. Thank you.");
}
