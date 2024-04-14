var lastSoundPlayedAt = 0; //Date.now();
var appSettings = [];
if (typeof browser === "undefined") {
	var browser = chrome;
}

//Required for the Template engine but not of any use in this script.
var arrDebug = [];
var items = new Map();

var startTime = Date.now();
function showRuntime(eventName) {
	arrDebug.push({ time: Date.now() - startTime, event: eventName });
}

var Tpl = new Template();
var TplMgr = new TemplateMgr();

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

	setInterval(async () => {
		browser.runtime.sendMessage({
			type: "keepAlive",
		});
	}, 25000);

	document.getElementById("date_loaded").innerText = new Date();
	init();
};

async function init() {
	const data = await browser.storage.local.get("settings");

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
			if (response.domain !== undefined) {
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

async function addItem(data) {
	const prom = await Tpl.loadFile("/view/notification_monitor.html");

	let { date, asin, title, search, img_url, domain, etv } = data;

	//If the local is not define, set it.
	if (vineLocale == null) setLocale(domain);

	//Prepare the ETV to be displayed
	let formattedETV;
	if (etv == null) {
		formattedETV = "";
	} else {
		formattedETV = new Intl.NumberFormat(vineLocale, {
			style: "currency",
			currency: vineCurrency,
		}).format(etv);
	}
	let formattedDate = new Date(date + " GMT").toLocaleString(vineLocale);

	Tpl.setVar("id", asin);
	Tpl.setVar("domain", vineDomain);
	Tpl.setVar("title", "New item");
	Tpl.setVar("date", formattedDate);
	Tpl.setVar("search", search);
	Tpl.setVar("asin", asin);
	Tpl.setVar("description", title);
	Tpl.setVar("img_url", img_url);
	Tpl.setVar("etv", formattedETV);

	let content = Tpl.render(prom);

	insertMessageIfAsinIsUnique(content, asin, etv, title);
}

function insertMessageIfAsinIsUnique(content, asin, etv, title) {
	var newID = `vh-notification-${asin}`;

	let shouldHighlight = false;
	let shouldSkip = false;

	if (appSettings.general.highlightKeywords.length > 0) {
		shouldHighlight = keywordMatch(appSettings.general.highlightKeywords, title);
	}

	let couldBeSkipped =
		!shouldHighlight &&
		appSettings.general.newItemMonitorNotificationHiding &&
		appSettings.general.hideKeywords.length > 0;

	if (couldBeSkipped) {
		shouldSkip = keywordMatch(appSettings.general.hideKeywords, title);
	}

	if (!shouldSkip) {
		if (items.has(asin)) {
			//Item already exist, update ETV
			console.log("checking etv");
			if (etv != items.get(asin)) {
				setETV(asin, etv);
			}
		} else {
			playSoundIfEnabled();

			//New items to be added
			items.set(asin, etv);
			const newBody = document.getElementById("vh-items-container");
			newBody.insertAdjacentHTML("afterbegin", content);
			setETV(asin, etv);

			if (shouldHighlight) {
				//Highlight if matches a keyword
				const newTile = document.getElementById(newID);
				newTile.classList.add("keyword-highlight");
			}
		}
	}
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

function setETV(asin, etv) {
	var itemID = `vh-notification-${asin}`;
	const etvClass = document.getElementById(itemID);

	//Highlight for ETV
	if (etv == "0.00") {
		etvClass.classList.add("zeroETV");
	}
	//Remove ETV Value if it does not exist
	if (etv == null) {
		let etvElement = document.querySelector("#" + itemID + " #etv_value");
		etvElement.style.display = "none";
	}
}

function keywordMatch(keywords, title) {
	return keywords.some((word) => {
		const regex = new RegExp(`\\b${word}\\b`, "i");
		return word && regex.test(title);
	});
}
