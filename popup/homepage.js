//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.

var appSettings = {};
let manifest = chrome.runtime.getManifest();
appVersion = manifest.version;
document.querySelectorAll("#version")[0].innerText = appVersion;

async function loadSettings() {
	const data = await chrome.storage.local.get("settings");
	Object.assign(appSettings, data.settings);
	init();
}
loadSettings();

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

function handleChildrenOptions(parent_key) {
	let key = CSS.escape(parent_key);
	let parentObj = document.querySelector(key);

	//$(parentObj).next("div").children("label").toggle();
}

function handleDynamicFields(key) {
	handleDependantChildCheckBoxes("hiddenTab.active", ["hiddenTab.remote"]);

	handleDependantChildCheckBoxes("general.displayFirstSeen", ["general.bookmark"]);

	handleDependantChildCheckBoxes("general.newItemNotification", ["general.displayNewItemNotifications"]);

	handleDependantChildCheckBoxes("general.displayNewItemNotifications", [
		"general.newItemNotificationImage",
		"general.newItemNotificationSound",
	]);
}
function handleDependantChildCheckBoxes(parentChk, arrChilds) {
	let keyE = CSS.escape(parentChk);
	let checked = document.querySelector(`input[name='${keyE}']`).checked;

	for (i = 0; i < arrChilds.length; i++) {
		keyF = CSS.escape(arrChilds[i]);
		document.querySelector(`[name='${keyF}']`).disabled = !checked;
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
	//###################
	//#### UI interaction

	key = CSS.escape("discord.active");
	document.querySelector(`label[for='${key}'] input`).onclick = function () {
		setTimeout(() => drawDiscord(), 1);
	};

	//###################
	//## Load/save settings:

	//hiddenItemsCacheSize
	var select = document.getElementById("hiddenItemsCacheSize");
	for (var i = 0; i < select.options.length; i++) {
		if (select.options[i].value == appSettings.general.hiddenItemsCacheSize) {
			select.options[i].selected = true;
		}
	}
	document.getElementById("hiddenItemsCacheSize").onchange = async function () {
		appSettings.general.hiddenItemsCacheSize = document.getElementById("hiddenItemsCacheSize").value;
		await chrome.storage.local.set({ settings: appSettings });
	};

	//general.verbosePaginationStartPadding
	select = document.getElementById("verbosePaginationStartPadding");
	for (i = 0; i < select.options.length; i++) {
		if (select.options[i].value == appSettings.general.verbosePaginationStartPadding) {
			select.options[i].selected = true;
		}
	}
	document.getElementById("verbosePaginationStartPadding").onchange = async function () {
		appSettings.general.verbosePaginationStartPadding = document.getElementById(
			"verbosePaginationStartPadding"
		).value;
		await chrome.storage.local.set({ settings: appSettings });
	};

	//general.newItemMonitorNotificationSound
	select = document.getElementById("newItemMonitorNotificationSound");
	for (i = 0; i < select.options.length; i++) {
		if (select.options[i].value == appSettings.general.newItemMonitorNotificationSound) {
			select.options[i].selected = true;
		}
	}
	document.getElementById("newItemMonitorNotificationSound").onchange = async function () {
		appSettings.general.newItemMonitorNotificationSound = document.getElementById(
			"newItemMonitorNotificationSound"
		).value;
		await chrome.storage.local.set({ settings: appSettings });
	};

	//UUID:
	key = CSS.escape("general.uuid");
	document.querySelector(`#${key}`).onmouseenter = function () {
		let key = CSS.escape("general.uuid");
		document.querySelector(`#${key}`).type = "text";
	};
	document.querySelector(`#${key}`).onmouseleave = function () {
		let key = CSS.escape("general.uuid");
		document.querySelector(`#${key}`).type = "password";
	};

	document.querySelector(`#${key}`).value = appSettings.general.uuid;

	document.querySelector("#saveUUID").onclick = async function () {
		document.querySelector("#saveUUID").disabled = true;
		let key = CSS.escape("general.uuid");
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

	document.getElementById("keyBindingsNextPage").value = appSettings.keyBindings.nextPage;
	document.getElementById("keyBindingsPreviousPage").value = appSettings.keyBindings.previousPage;
	document.getElementById("keyBindingsRFYPage").value = appSettings.keyBindings.RFYPage;
	document.getElementById("keyBindingsAFAPage").value = appSettings.keyBindings.AFAPage;
	document.getElementById("keyBindingsAIPage").value = appSettings.keyBindings.AIPage;
	document.getElementById("keyBindingsAIPage2").value =
		appSettings.keyBindings.AIPage2 == undefined ? "" : appSettings.keyBindings.AIPage2;
	document.getElementById("keyBindingsAIPage3").value =
		appSettings.keyBindings.AIPage3 == undefined ? "" : appSettings.keyBindings.AIPage3;
	document.getElementById("keyBindingsAIPage4").value =
		appSettings.keyBindings.AIPage4 == undefined ? "" : appSettings.keyBindings.AIPage4;
	document.getElementById("keyBindingsAIPage5").value =
		appSettings.keyBindings.AIPage5 == undefined ? "" : appSettings.keyBindings.AIPage5;
	document.getElementById("keyBindingsAIPage6").value =
		appSettings.keyBindings.AIPage6 == undefined ? "" : appSettings.keyBindings.AIPage6;
	document.getElementById("keyBindingsAIPage7").value =
		appSettings.keyBindings.AIPage7 == undefined ? "" : appSettings.keyBindings.AIPage7;
	document.getElementById("keyBindingsAIPage8").value =
		appSettings.keyBindings.AIPage8 == undefined ? "" : appSettings.keyBindings.AIPage8;
	document.getElementById("keyBindingsAIPage9").value =
		appSettings.keyBindings.AIPage9 == undefined ? "" : appSettings.keyBindings.AIPage9;
	document.getElementById("keyBindingsAIPage10").value =
		appSettings.keyBindings.AIPage10 == undefined ? "" : appSettings.keyBindings.AIPage10;
	document.getElementById("keyBindingsHideAll").value = appSettings.keyBindings.hideAll;
	document.getElementById("keyBindingsShowAll").value = appSettings.keyBindings.showAll;
	document.getElementById("keyBindingsDebug").value = appSettings.keyBindings.debug;

	document.getElementById("keyBindingsNextPage").addEventListener("change", function () {
		appSettings.keyBindings.nextPage = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsPreviousPage").addEventListener("change", function () {
		appSettings.keyBindings.previousPage = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsRFYPage").addEventListener("change", function () {
		appSettings.keyBindings.RFYPage = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAFAPage").addEventListener("change", function () {
		appSettings.keyBindings.AFAPage = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage").addEventListener("change", function () {
		appSettings.keyBindings.AIPage = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage2").addEventListener("change", function () {
		appSettings.keyBindings.AIPage2 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage3").addEventListener("change", function () {
		appSettings.keyBindings.AIPage3 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage4").addEventListener("change", function () {
		appSettings.keyBindings.AIPage4 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage5").addEventListener("change", function () {
		appSettings.keyBindings.AIPage5 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage6").addEventListener("change", function () {
		appSettings.keyBindings.AIPage6 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage7").addEventListener("change", function () {
		appSettings.keyBindings.AIPage7 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage8").addEventListener("change", function () {
		appSettings.keyBindings.AIPage8 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage9").addEventListener("change", function () {
		appSettings.keyBindings.AIPage9 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsAIPage10").addEventListener("change", function () {
		appSettings.keyBindings.AIPage10 = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsHideAll").addEventListener("change", function () {
		appSettings.keyBindings.hideAll = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsShowAll").addEventListener("change", function () {
		appSettings.keyBindings.showAll = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});
	document.getElementById("keyBindingsDebug").addEventListener("change", function () {
		appSettings.keyBindings.debug = this.value;
		chrome.storage.local.set({ settings: appSettings });
	});

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
	manageCheckboxSetting("general.newItemNotification");
	manageCheckboxSetting("general.displayNewItemNotifications");
	manageCheckboxSetting("general.newItemNotificationSound");
	//manageCheckboxSetting("general.newItemMonitorNotificationSound");
	manageCheckboxSetting("general.newItemMonitorNotificationHiding");
	manageCheckboxSetting("general.newItemMonitorDuplicateImageHiding");
	manageCheckboxSetting("general.newItemNotificationImage");
	manageCheckboxSetting("keyBindings.active");
	manageCheckboxSetting("hiddenTab.active");
	manageCheckboxSetting("hiddenTab.remote");
	manageCheckboxSetting("pinnedTab.active");
	manageCheckboxSetting("general.reduceNotifications");
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
