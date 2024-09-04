//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.

const arrSounds = ["notification", "upgrade", "vintage-horn"];
var appSettings = {};

async function loadSettings() {
	const data = await chrome.storage.local.get("settings");
	Object.assign(appSettings, data.settings);
}
loadSettings();

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
function initiateSettings() {
	//##########################
	// TABS
	//Bind the click event for the tabs
	document.querySelectorAll("#tabs > ul li").forEach(function (item) {
		item.onclick = function (event) {
			currentTab = this.querySelector("a").href.split("#").pop();
			selectCurrentTab();
			this.classList.add("active");
		};
	});

	selectCurrentTab(true);
	drawDiscord();

	document.getElementById("notificationsMonitorLink").href = chrome.runtime.getURL("page/notifications.html");
	document.getElementById("settingsLink").href = chrome.runtime.getURL("page/settings.html");

	//###################
	//#### UI interaction

	//When a checkbox in the legend of a fieldset if changed,
	//enable or disable all the field contained in that fieldset.
	document.querySelectorAll("fieldset").forEach((fieldset) => {
		const checkbox = fieldset.querySelector('legend input[type="checkbox"]');

		if (checkbox) {
			// Function to enable/disable the fieldset contents
			const toggleFieldsetContent = () => {
				const isChecked = checkbox.checked;
				const elements = fieldset.querySelectorAll("input, select, button");

				elements.forEach((element) => {
					// Skip the checkbox itself in the legend
					if (element !== checkbox) {
						element.disabled = !isChecked;
					}
				});
			};

			// Add the event listener to the checkbox
			checkbox.addEventListener("change", toggleFieldsetContent);

			// Initial state check
			toggleFieldsetContent();
		}
	});

	//###################
	//## Load/save settings:

	//## TAB - GENERAL

	manageCheckboxSetting("general.topPagination");
	manageCheckboxSetting("general.verbosePagination");
	manageCheckboxSetting("general.displayETV");
	manageCheckboxSetting("general.displayModalETV");
	manageCheckboxSetting("general.displayFullTitleTooltip");
	manageCheckboxSetting("general.displayVariantIcon");
	manageCheckboxSetting("general.displayFirstSeen");
	manageCheckboxSetting("general.bookmark");
	manageCheckboxSetting("hiddenTab.active");
	manageCheckboxSetting("hiddenTab.scrollToRFY");
	manageCheckboxSetting("pinnedTab.active");
	manageCheckboxSetting("unavailableTab.active");
	manageCheckboxSetting("unavailableTab.compactToolbar");
	manageCheckboxSetting("general.modalNavigation");
	manageCheckboxSetting("general.searchOpenModal");
	manageCheckboxSetting("general.listView");
	manageCheckboxSetting("general.scrollToRFY");

	//##TAB - NOTIFICATIONS

	manageCheckboxSetting("notification.active");
	manageCheckboxSetting("notification.pushNotifications");
	manageCheckboxSetting("notification.screen.active");
	manageCheckboxSetting("notification.screen.thumbnail");
	manageCheckboxSetting("notification.monitor.hideList");
	manageCheckboxSetting("notification.monitor.hideDuplicateThumbnail");
	manageCheckboxSetting("notification.reduce");

	//Sliders
	manageSlider("notification.screen.regular.volume");
	manageSlider("notification.monitor.highlight.volume");
	manageSlider("notification.monitor.regular.volume");
	manageSlider("notification.monitor.zeroETV.volume");

	//Select boxes
	manageSelectBox("general.hiddenItemsCacheSize");
	manageSelectBox("general.verbosePaginationStartPadding");
	manageSelectBox("notification.monitor.regular.sound");
	manageSelectBox("notification.monitor.highlight.sound");
	manageSelectBox("notification.screen.regular.sound");
	manageSelectBox("notification.monitor.zeroETV.sound");

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
		"playMonitorZeroETVNotification",
		"notification.monitor.zeroETV.sound",
		"notification.monitor.zeroETV.volume"
	);
	managePlayButton(
		"playMonitorRegularNotification",
		"notification.monitor.regular.sound",
		"notification.monitor.regular.volume"
	);

	manageInputText("notification.monitor.highlight.color");
	manageInputText("notification.monitor.zeroETV.color");

	//##TAB - SYSTEM

	manageCheckboxSetting("hiddenTab.remote");
	manageCheckboxSetting("general.versionInfoPopup", false);
	manageCheckboxSetting("general.GDPRPopup", false);

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

	//##TAB - BRENDA:

	manageCheckboxSetting("discord.active"); //Handled manually

	const chkDiscord = document.querySelector(`#discordactive`);
	if (chkDiscord) {
		chkDiscord.addEventListener("change", function () {
			setTimeout(() => drawDiscord(), 1);
		});
	}

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
	if (appSettings.discord.guid) {
		document.querySelector("#guid-txt").innerText = appSettings.discord.guid;
	}

	//##TAB - KEYWORDS

	manageTextareaCSK("general.highlightKeywords");
	manageTextareaCSK("general.hideKeywords");

	//##TAB - KEYBINDINGS

	manageCheckboxSetting("keyBindings.active");

	manageInputText("keyBindings.nextPage");
	manageInputText("keyBindings.previousPage");
	manageInputText("keyBindings.RFYPage");
	manageInputText("keyBindings.AFAPage");
	manageInputText("keyBindings.AIPage");
	manageInputText("keyBindings.AIPage2");
	manageInputText("keyBindings.AIPage3");
	manageInputText("keyBindings.AIPage4");
	manageInputText("keyBindings.AIPage5");
	manageInputText("keyBindings.AIPage6");
	manageInputText("keyBindings.AIPage7");
	manageInputText("keyBindings.AIPage8");
	manageInputText("keyBindings.AIPage9");
	manageInputText("keyBindings.AIPage10");
	manageInputText("keyBindings.availableTab");
	manageInputText("keyBindings.unavailableTab");
	manageInputText("keyBindings.hiddenTab");
	manageInputText("keyBindings.pinnedTab");
	manageInputText("keyBindings.hideAll");
	manageInputText("keyBindings.showAll");
	manageInputText("keyBindings.hideAllNext");
	manageInputText("keyBindings.debug");

	//##TAB - STYLES

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
	manageTextarea("general.customCSS");

	//##TAB - ?

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
}

//CSK: Comma Separated Keywords
function manageTextareaCSK(key) {
	const val = JSONGetPathValue(appSettings, key);
	const obj = document.querySelector(`textarea[name='${key}']`);
	if (obj == null) {
		throw new Error("Textarea name='" + key + "' does not exist");
	}
	obj.value = val.join(", ");
	obj.addEventListener("change", async function () {
		let arr = [];
		arr = obj.value
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item !== "");
		if (arr.length == 1 && arr[0] == "") {
			arr = [];
		}
		deepSet(appSettings, key, arr);
		await chrome.storage.local.set({ settings: appSettings });
	});
}

function manageTextarea(key) {
	const val = JSONGetPathValue(appSettings, key);
	const obj = document.querySelector(`textarea[name='${key}']`);
	if (obj == null) {
		throw new Error("Textarea name='" + key + "' does not exist");
	}
	obj.value = val;
	obj.addEventListener("change", async function () {
		deepSet(appSettings, key, obj.value);
		await chrome.storage.local.set({ settings: appSettings });
	});
}

function manageInputText(key) {
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
	const val = def === null ? JSONGetPathValue(appSettings, key) : def;
	const keyE = CSS.escape(key);
	const checkObj = document.querySelector(`input[name='${keyE}']`);
	checkObj.checked = val;

	//Trigger the change event so the fieldset will update accordingly.
	const event = new Event("change");
	checkObj.dispatchEvent(event);

	//Saving the change
	checkObj.addEventListener("change", async function () {
		//Change in value
		deepSet(appSettings, key, checkObj.checked);
		await chrome.storage.local.set({ settings: appSettings });
	});

	//Clicking the label will check the checkbox
	document.querySelector(`label[for='${keyE}']`).onclick = async function (event) {
		if (event.target.nodeName == "INPUT") {
			return false;
		}

		//Change the value
		const element = document.querySelector(`input[name='${keyE}']`);
		element.click();
	}.bind(keyE);
}

//Utility functions

function isNumeric(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
}

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
