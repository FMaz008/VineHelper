//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.

const arrSounds = ["notification", "upgrade", "vintage-horn"];
var appSettings = {};

async function loadSettings() {
	const data = await chrome.storage.local.get("settings");
	Object.assign(appSettings, data.settings);
}
loadSettings();

console.log(appSettings);

function setCB(key, value) {
	let keyE = CSS.escape(key);

	let cb = document.querySelector(`input[name='${keyE}']`);
	try {
		cb.checked = value;
	} catch (E) {
		console.log(E);
		console.log(key);
	}
	handleDynamicFields(key);
}

function getCB(key) {
	key = CSS.escape(key);
	let cb = document.querySelector(`input[name='${key}']`);

	return cb.checked == true;
}

function handleDynamicFields(key) {
	handleDependantChildCheckBoxes("hiddenTab.active", ["hiddenTab.remote"]);

	handleDependantChildCheckBoxes("general.displayFirstSeen", ["general.bookmark"]);

	handleDependantChildCheckBoxes("notification.active", [
		"notification.screen.active",
		"notification.monitor.highlight.sound",
		"notification.monitor.highlight.volume",
		"notification.monitor.regular.sound",
		"notification.monitor.regular.volume",
		"notification.monitor.hideList",
		"notification.monitor.hideDuplicateThumbnail",
	]);

	handleDependantChildCheckBoxes("notification.screen.active", [
		"notification.screen.thumbnail",
		"notification.screen.regular.sound",
		"notification.screen.regular.volume",
	]);
}
function handleDependantChildCheckBoxes(parentChk, arrChilds) {
	let keyE = CSS.escape(parentChk);
	let checked = document.querySelector(`input[name='${keyE}']`).checked;

	for (i = 0; i < arrChilds.length; i++) {
		const keyF = CSS.escape(arrChilds[i]);
		const obj = document.querySelector(`[name='${keyF}']`);
		if (obj == null) {
			throw new Error("Element name='" + keyF + "' does not exist.");
		}
		obj.disabled = !checked;
	}
}

async function drawDiscord() {
	//Show or hide the discord options
	document.querySelector("#discordOptions").style.display = appSettings.discord.active ? "block" : "none";

	if (appSettings.discord.active) {
		let showLink = JSONGetPathValue(appSettings, "discord.guid") === null;

		document.querySelector("#discord-guid-link").style.display = showLink ? "block" : "none";
		document.querySelector("#discord-guid-unlink").style.display = showLink ? "none" : "block";
	}
}

var currentTab = "tabs-1";

function selectCurrentTab(firstRun = false) {
	//Hide all tabs
	document.querySelectorAll(".options").forEach(function (item) {
		item.style.display = "none";
	});

	if (!firstRun)
		document.querySelectorAll("#tabs > ul li").forEach(function (item) {
			item.classList.remove("active");
		});

	//Display the current tab
	document.querySelector("#" + currentTab).style.display = "flex";
}
function init() {
	//Factory reset
	document.getElementById("factoryReset").addEventListener("click", async function () {
		if (
			confirm(
				"SAVE YOUR UUID OR YOU WILL LOOSE YOUR REMOTE STORED ITEMS !\n\nReset all Vine Helper settings & local storage to default?"
			)
		) {
			await chrome.storage.local.clear();
			alert(
				"All settings were deleted. RELOAD AMAZON VINE to restaure default settings.\nDO NOT EDIT OPTIONS before you reloaded an amazon vine page."
			);
		}
	});
	document.getElementById("hiddenItemReset").addEventListener("click", async function () {
		if (confirm("Delete all locally stored hidden items from Vine Helper?")) {
			chrome.storage.local.set({ hiddenItems: [] });
			alert("Hidden items in local storage emptied.");
		}
	});

	//Bind the click event for the tabs
	document.querySelectorAll("#tabs > ul li").forEach(function (item) {
		item.onclick = function (event) {
			currentTab = this.querySelector("a").href.split("#").pop();
			selectCurrentTab();
			this.classList.add("active");
		};
	});
	//Prevent links from being clickable
	document.querySelectorAll("#tabs > ul li a").forEach(function (item) {
		item.onclick = function (event) {
			if (event.target.href == "#") event.preventDefault();
		};
	});
	selectCurrentTab(true);
	drawDiscord();

	document.getElementById("notificationsMonitor").href = chrome.runtime.getURL("page/notifications.html");
	document.getElementById("notificationsMonitorLink").href = chrome.runtime.getURL("page/notifications.html");
	document.getElementById("settingsLink").href = chrome.runtime.getURL("page/settings.html");

	//###################
	//#### UI interaction

	const chkDiscord = document.querySelector(`#discordactive`);
	if (chkDiscord) {
		chkDiscord.addEventListener("change", function () {
			setTimeout(() => drawDiscord(), 1);
		});
	}

	//###################
	//## Load/save settings:

	//Sliders
	manageSlider("notification.screen.regular.volume");
	manageSlider("notification.monitor.highlight.volume");
	manageSlider("notification.monitor.regular.volume");

	//Select boxes
	manageSelectBox("general.hiddenItemsCacheSize");
	manageSelectBox("general.verbosePaginationStartPadding");
	manageSelectBox("notification.monitor.regular.sound");
	manageSelectBox("notification.monitor.highlight.sound");
	manageSelectBox("notification.screen.regular.sound");

	//Play buttons
	managePlayButton(
		"playScreenNotification",
		"notification.screen.regular.sound",
		"notification.screen.regular.volume"
	);
	managePlayButton(
		"playMonitorHighlightNotification",
		"notification.monitor.highlight.sound",
		"notification.monitor.highlight.volume"
	);
	managePlayButton(
		"playMonitorRegularNotification",
		"notification.monitor.regular.sound",
		"notification.monitor.regular.volume"
	);

	//UUID:
	key = CSS.escape("generaluuid");
	document.querySelector(`#${key}`).onmouseenter = function () {
		let key = CSS.escape("generaluuid");
		document.querySelector(`#${key}`).type = "text";
	};
	document.querySelector(`#${key}`).onmouseleave = function () {
		let key = CSS.escape("generaluuid");
		document.querySelector(`#${key}`).type = "password";
	};

	document.querySelector(`#${key}`).value = appSettings.general.uuid;

	document.querySelector("#saveUUID").onclick = async function () {
		document.querySelector("#saveUUID").disabled = true;
		let key = CSS.escape("generaluuid");
		//Post a fetch request to confirm if the UUID is valid
		let arrJSON = {
			api_version: 4,
			action: "validate_uuid",
			uuid: document.querySelector("#" + key).value,
			country: "loremipsum",
		};
		let jsonArrURL = JSON.stringify(arrJSON);

		let url = "https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;
		await fetch(url)
			.then((response) => response.json())
			.then(async function (serverResponse) {
				if (serverResponse["ok"] == "ok") {
					appSettings.general.uuid = serverResponse["uuid"];
					await chrome.storage.local.set({ settings: appSettings });
				} else {
					alert("Invalid UUID");
					key = CSS.escape("general.uuid");
					document.querySelector(`#${key}`).value = appSettings.general.uuid;
				}
			})
			.catch(function () {
				(error) => console.log(error);
			});
		document.querySelector("#saveUUID").disabled = false;
	};

	document.querySelector("#saveGUID").onclick = async function () {
		document.querySelector("#saveGUID").disabled = true;
		let key = CSS.escape("discord.guid");
		//Post a fetch request to the Brenda API from the AmazonVine Discord server
		//We want to check if the guid is valid.
		let url = "https://api.llamastories.com/brenda/user/" + document.querySelector("#" + key).value;
		const response = await fetch(url, { method: "GET" });
		if (response.status == 200) {
			appSettings.discord.guid = document.querySelector(`#${key}`).value;
			await chrome.storage.local.set({ settings: appSettings });
			document.querySelector("#guid-txt").innerText = appSettings.discord.guid;
			document.querySelector("#discord-guid-link").style.display = "none";
			document.querySelector("#discord-guid-unlink").style.display = "block";
		} else {
			document.querySelector(`#${key}`).value = "";
			alert("invalid API Token.");
		}
		document.querySelector("#saveGUID").disabled = false;
	};
	document.querySelector("#unlinkGUID").onclick = async function () {
		appSettings.discord.guid = null;
		await chrome.storage.local.set({ settings: appSettings });

		document.querySelector("#discord-guid-link").style.display = "block";
		document.querySelector("#discord-guid-unlink").style.display = "none";
	};

	//Copy buttons
	document.getElementById("copyBTC").addEventListener("click", function () {
		navigator.clipboard
			.writeText("bc1q0f82vk79u7hzxcrqe6q2levzvhdrqe72fm5w8z")
			.then(() => {
				// Alert the user that the text has been copied
				alert("BTC address copied to clipboard: ");
			})
			.catch((err) => {
				console.error("Failed to copy: ", err);
			});
	});
	document.getElementById("copyETH").addEventListener("click", function () {
		navigator.clipboard
			.writeText("0xF5b68799b43C358E0A54482f0D8445DFBEA9BDF1")
			.then(() => {
				// Alert the user that the text has been copied
				alert("ETH address copied to clipboard");
			})
			.catch((err) => {
				console.error("Failed to copy: ", err);
			});
	});

	//Keybindings

	if (appSettings.keyBindings == undefined) {
		appSettings.keyBindings = {};
		appSettings.keyBindings.nextPage = "n";
		appSettings.keyBindings.previousPage = "p";
		appSettings.keyBindings.RFYPage = "r";
		appSettings.keyBindings.AFAPage = "a";
		appSettings.keyBindings.AIPage = "i";
		appSettings.keyBindings.hideAll = "h";
		appSettings.keyBindings.showAll = "s";
		appSettings.keyBindings.debug = "d";
		chrome.storage.local.set({ settings: appSettings });
	}

	manageKeybindings("keyBindings.nextPage");
	manageKeybindings("keyBindings.previousPage");
	manageKeybindings("keyBindings.RFYPage");
	manageKeybindings("keyBindings.AFAPage");
	manageKeybindings("keyBindings.AIPage");
	manageKeybindings("keyBindings.AIPage2");
	manageKeybindings("keyBindings.AIPage3");
	manageKeybindings("keyBindings.AIPage4");
	manageKeybindings("keyBindings.AIPage5");
	manageKeybindings("keyBindings.AIPage6");
	manageKeybindings("keyBindings.AIPage7");
	manageKeybindings("keyBindings.AIPage8");
	manageKeybindings("keyBindings.AIPage9");
	manageKeybindings("keyBindings.AIPage10");
	manageKeybindings("keyBindings.hideAll");
	manageKeybindings("keyBindings.showAll");
	manageKeybindings("keyBindings.debug");

	//Keywords

	arrHighlight =
		appSettings.general.highlightKeywords == undefined ? "" : appSettings.general.highlightKeywords.join(", ");
	document.getElementById("generalhighlightKeywords").value = arrHighlight;
	arrHide = appSettings.general.hideKeywords == undefined ? "" : appSettings.general.hideKeywords.join(", ");
	document.getElementById("generalhideKeywords").value = arrHide;

	document.getElementById("generalhighlightKeywords").addEventListener("change", function () {
		let arr = [];
		arr = document
			.getElementById("generalhighlightKeywords")
			.value.split(",")
			.map((item) => item.trim())
			.filter((item) => item !== "");
		if (arr.length == 1 && arr[0] == "") arr = [];
		appSettings.general.highlightKeywords = arr;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("generalhideKeywords").addEventListener("change", function () {
		let arr = [];
		arr = document
			.getElementById("generalhideKeywords")
			.value.split(",")
			.map((item) => item.trim())
			.filter((item) => item !== "");
		if (arr.length == 1 && arr[0] == "") arr = [];
		appSettings.general.hideKeywords = arr;
		chrome.storage.local.set({ settings: appSettings });
	});

	//Manage checkboxes load and save
	manageCheckboxSetting("general.topPagination");
	manageCheckboxSetting("general.verbosePagination");
	manageCheckboxSetting("general.versionInfoPopup", false);
	manageCheckboxSetting("general.GDPRPopup", false);
	manageCheckboxSetting("general.displayETV");
	manageCheckboxSetting("general.displayModalETV");
	manageCheckboxSetting("general.displayFullTitleTooltip");
	manageCheckboxSetting("general.displayVariantIcon");
	manageCheckboxSetting("general.displayFirstSeen");
	manageCheckboxSetting("general.bookmark");
	manageCheckboxSetting("notification.active");
	manageCheckboxSetting("notification.screen.active");
	manageCheckboxSetting("notification.screen.thumbnail");
	manageCheckboxSetting("notification.monitor.hideList");
	manageCheckboxSetting("notification.monitor.hideDuplicateThumbnail");
	manageCheckboxSetting("notification.reduce");
	manageCheckboxSetting("keyBindings.active");
	manageCheckboxSetting("hiddenTab.active");
	manageCheckboxSetting("hiddenTab.remote");
	manageCheckboxSetting("pinnedTab.active");
	manageCheckboxSetting("discord.active"); //Handled manually
	manageCheckboxSetting("unavailableTab.active");
	manageCheckboxSetting("unavailableTab.compactToolbar");
	manageCheckboxSetting("thorvarium.mobileios");
	manageCheckboxSetting("thorvarium.mobileandroid");
	manageCheckboxSetting("thorvarium.smallItems");
	manageCheckboxSetting("thorvarium.removeHeader");
	manageCheckboxSetting("thorvarium.removeFooter");
	manageCheckboxSetting("thorvarium.removeAssociateHeader");
	manageCheckboxSetting("thorvarium.moreDescriptionText");
	manageCheckboxSetting("thorvarium.darktheme");
	manageCheckboxSetting("thorvarium.ETVModalOnTop");
	manageCheckboxSetting("thorvarium.categoriesWithEmojis");
	manageCheckboxSetting("thorvarium.paginationOnTop");
	manageCheckboxSetting("thorvarium.collapsableCategories");
	manageCheckboxSetting("thorvarium.stripedCategories");
	manageCheckboxSetting("thorvarium.limitedQuantityIcon");
	manageCheckboxSetting("thorvarium.RFYAFAAITabs");
}

function manageKeybindings(key) {
	const val = JSONGetPathValue(appSettings, key);
	const obj = document.querySelector(`label[for='${key}'] input`);
	if (obj == null) {
		throw new Error("Keybinding input name='" + key + "' does not exist");
	}
	obj.value = val == null ? "" : val;

	obj.addEventListener("change", async function () {
		deepSet(appSettings, key, obj.value);
		await chrome.storage.local.set({ settings: appSettings });
	});
}

function manageSlider(key) {
	const val = JSONGetPathValue(appSettings, key);
	const volumeObj = document.querySelector(`label[for='${key}'] input`);
	if (volumeObj == null) {
		throw new Error("Slider input name='" + key + "' does not exist");
	}
	volumeObj.value = Number(val == null ? 0 : val);
	volumeObj.addEventListener("change", async function () {
		deepSet(appSettings, key, volumeObj.value);
		await chrome.storage.local.set({ settings: appSettings });
	});
}
function managePlayButton(btnId, selectName, volumeName) {
	const btn = document.getElementById(btnId);
	btn.addEventListener("click", function () {
		const volumeObj = document.querySelector(`label[for='${volumeName}'] input`);
		const selectObj = document.querySelector(`label[for='${selectName}'] select`);
		if (selectObj.value == "0") {
			return false;
		}

		const audioFilePath = "resource/sound/" + selectObj.value + ".mp3";
		const audioElement = new Audio(chrome.runtime.getURL(audioFilePath));
		const handleEnded = () => {
			audioElement.removeEventListener("ended", handleEnded); // Remove the event listener
			audioElement.remove(); // Remove the audio element from the DOM
		};
		audioElement.addEventListener("ended", handleEnded);
		audioElement.volume = Number(volumeObj.value);
		audioElement.play();
	});
}

function manageSelectBox(key) {
	const val = JSONGetPathValue(appSettings, key);
	const keyE = CSS.escape(key);
	const selectObj = document.querySelector(`label[for='${keyE}'] select`);

	for (i = 0; i < selectObj.options.length; i++) {
		if (selectObj.options[i].value == val) {
			selectObj.options[i].selected = true;
		}
	}

	selectObj.addEventListener("change", async function () {
		deepSet(appSettings, key, selectObj.value);
		await chrome.storage.local.set({ settings: appSettings });
	});
}

function manageCheckboxSetting(key, def = null) {
	let val = def === null ? JSONGetPathValue(appSettings, key) : def;
	setCB(key, val); //Initial setup

	let keyE = CSS.escape(key);

	//Clicking the label will check the checkbox
	document.querySelector(`label[for='${keyE}']`).onclick = async function (event) {
		if (event.target.nodeName == "INPUT") return false;

		//Change the value
		const newValue = getCB(key);
		setCB(key, !newValue);

		const e = new Event("change");
		const element = document.querySelector(`input[name='${keyE}']`);
		element.dispatchEvent(e);
	}.bind(keyE);
	document.querySelector(`input[name='${keyE}']`).onchange = async function () {
		//Change in value
		handleDynamicFields(key);
		const newValue = getCB(key);
		deepSet(appSettings, key, newValue);
		await chrome.storage.local.set({ settings: appSettings });
	};
}

//Utility functions

function isNumeric(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
}

/*
function JSONPathToObject(path, value) {
    const arrPathLvl = path.split(".");
    var jsonObj = "";
    var jsonEnd = "";
    for (let i = 0; i < arrPathLvl.length; i++) {
        jsonObj = jsonObj + '{"' + arrPathLvl[i] + '":';
        jsonEnd = "}" + jsonEnd;
    }
    return JSON.parse(jsonObj + value + jsonEnd);
}
*/

const deepSet = (obj, path, val) => {
	path = path.replaceAll("[", ".[");
	const keys = path.split(".");

	for (let i = 0; i < keys.length; i++) {
		let currentKey = keys[i];
		let nextKey = keys[i + 1];
		if (currentKey.includes("[")) {
			currentKey = parseInt(currentKey.substring(1, currentKey.length - 1));
		}
		if (nextKey && nextKey.includes("[")) {
			nextKey = parseInt(nextKey.substring(1, nextKey.length - 1));
		}

		if (typeof nextKey !== "undefined") {
			obj[currentKey] = obj[currentKey] ? obj[currentKey] : isNaN(nextKey) ? {} : [];
		} else {
			obj[currentKey] = val;
		}

		obj = obj[currentKey];
	}
};

function JSONGetPathValue(obj, path) {
	try {
		let val = path.split(".").reduce((c, s) => c[s], obj);
		if (val == undefined) return null;
		else return val;
	} catch (error) {
		return null;
	}
}

/*
Does't work in popup window for some reason
$("a.tips").each(function () {
	if($(this).attr("title") != "tooltip")
		$(this).tooltip({ tooltipClass: "ui-tooltip" });
});
*/
