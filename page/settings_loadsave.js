import { SettingsMgr } from "../scripts/SettingsMgr.js";
const Settings = new SettingsMgr();

import { HiddenListMgr } from "../scripts/HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.
const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";
const arrSounds = ["notification", "upgrade", "vintage-horn"];

async function drawDiscord() {
	//Show or hide the discord options
	document.querySelector("#discordOptions").style.display = Settings.get("discord.active") ? "block" : "none";

	if (Settings.get("discord.active")) {
		let showLink = Settings.get("discord.guid", false) === null;

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
async function initiateSettings() {
	//Wait for the settings to be loaded.
	await Settings.waitForLoad();

	//Disable the premium options for non-premium users.
	if (!Settings.isPremiumUser()) {
		document
			.querySelectorAll(
				".premium-feature input, .premium-feature select, .premium-feature button, .premium-feature textarea"
			)
			.forEach(function (item) {
				item.disabled = true;
			});
	}

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
	manageCheckboxSetting("general.modalNavigation");
	manageCheckboxSetting("general.searchOpenModal");
	manageCheckboxSetting("general.listView");
	manageCheckboxSetting("general.scrollToRFY");
	manageCheckboxSetting("general.hideOptOutButton");
	manageCheckboxSetting("general.hideRecommendations");
	manageCheckboxSetting("general.reviewToolbar");
	manageCheckboxSetting("general.hideNoNews");
	manageCheckboxSetting("general.tileSize.active");
	manageCheckboxSetting("general.projectedAccountStatistics");
	manageColorPicker("general.bookmarkColor");
	manageCheckboxSetting("general.zeroETVHighlight.active");
	manageColorPicker("general.zeroETVHighlight.color");

	//##TAB - NOTIFICATIONS

	manageCheckboxSetting("notification.active");
	manageCheckboxSetting("notification.pushNotifications");
	manageCheckboxSetting("notification.pushNotificationsAFA");
	manageCheckboxSetting("notification.screen.active");
	manageCheckboxSetting("notification.screen.thumbnail");
	manageCheckboxSetting("notification.hideList");
	manageCheckboxSetting("notification.monitor.hideDuplicateThumbnail");
	manageCheckboxSetting("notification.reduce");
	manageRadio("notification.monitor.openLinksInNewTab");

	//Sliders
	manageSlider("notification.screen.regular.volume");
	manageSlider("notification.monitor.highlight.volume");
	manageSlider("notification.monitor.regular.volume");
	manageSlider("notification.monitor.zeroETV.volume");
	manageSelectBox("notification.soundCooldownDelay");

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

	manageColorPicker("notification.monitor.highlight.color");
	manageColorPicker("notification.monitor.zeroETV.color");

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
		if (confirm("Delete all remotely stored hidden items from Vine Helper?")) {
			const content = {
				api_version: 5,
				country: "loremipsum",
				action: "save_hidden_list",
				uuid: Settings.get("general.uuid", false),
				items: "DELETE_ALL",
			};
			//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
			fetch(VINE_HELPER_API_V5_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(content),
			}).then(async function (response) {
				alert("Hidden items in remote storage emptied.");
			});
		}
	});
	document.getElementById("fetchHiddenItems").addEventListener("click", async function () {
		const content = {
			api_version: 5,
			country: "loremipsum",
			action: "load_hidden_list",
			uuid: Settings.get("general.uuid", false),
		};
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(VINE_HELPER_API_V5_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		})
			.then((data) => data.json())
			.then(async function (data) {
				for (let i = 0; i < data.items.length; i++) {
					const asin = data.items[i];
					await HiddenList.addItem(asin, false, false);

					//Save at every chunk of ~1000 items to avoid storage space overflow
					//That way the garbage collector can work if needed.
					if (i % 1000 == 0) {
						await HiddenList.saveList(false); //Do not remote save
					}
				}
				await HiddenList.saveList(false); //Do not remote save
				alert(data.items.length + " hidden item(s) have been imported.");
			});
	});

	//UUID:
	let key = CSS.escape("generaluuid");
	document.querySelector(`#${key}`).onmouseenter = function () {
		let key = CSS.escape("generaluuid");
		document.querySelector(`#${key}`).type = "text";
	};
	document.querySelector(`#${key}`).onmouseleave = function () {
		let key = CSS.escape("generaluuid");
		document.querySelector(`#${key}`).type = "password";
	};

	document.querySelector(`#${key}`).value = Settings.get("general.uuid", false);

	document.querySelector("#saveUUID").onclick = async function () {
		document.querySelector("#saveUUID").disabled = true;
		let key = CSS.escape("generaluuid");
		//Post a fetch request to confirm if the UUID is valid

		const content = {
			api_version: 5,
			action: "validate_uuid",
			uuid: document.querySelector("#" + key).value,
			country: "loremipsum",
		};
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};
		await fetch(VINE_HELPER_API_V5_URL, options)
			.then((response) => response.json())
			.then(async function (serverResponse) {
				if (serverResponse["ok"] == "ok") {
					Settings.set("general.uuid", serverResponse["uuid"]);
				} else {
					alert("Invalid UUID");
					key = CSS.escape("general.uuid");
					document.querySelector(`#${key}`).value = Settings.get("general.uuid", false);
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
			Settings.set("discord.guid", document.querySelector(`#${key}`).value);

			document.querySelector("#guid-txt").innerText = Settings.get("discord.guid", false);
			document.querySelector("#discord-guid-link").style.display = "none";
			document.querySelector("#discord-guid-unlink").style.display = "block";
		} else {
			document.querySelector(`#${key}`).value = "";
			alert("invalid API Token.");
		}
		document.querySelector("#saveGUID").disabled = false;
	};
	document.querySelector("#unlinkGUID").onclick = async function () {
		Settings.set("discord.guid", null);

		document.querySelector("#discord-guid-link").style.display = "block";
		document.querySelector("#discord-guid-unlink").style.display = "none";
	};
	if (Settings.get("discord.guid", false)) {
		document.querySelector("#guid-txt").innerText = Settings.get("discord.guid");
	}

	//##TAB - KEYWORDS

	manageColorPicker("general.keywordHighlightColor");
	manageKeywords("general.highlightKeywords");
	manageKeywords("general.hideKeywords");
	manageTextareaCSK("general.blurKeywords");
	initiateTogglers();
	initiateTestKeywords();

	//##TAB - KEYBINDINGS

	manageCheckboxSetting("keyBindings.active");
	manageInputText("keyBindings.pauseFeed");
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

	//Patreon login link:
	document.getElementById("PatreonLogin").href =
		"https://www.patreon.com/oauth2/authorize" +
		"?response_type=code" +
		"&client_id=AqsjZu6eHaLtO3y8bj0VPydtRCNNV2n-5aQoWVKil4IPNb3qoxkT75VQMhSALTcO" +
		"&redirect_uri=" +
		encodeURIComponent(VINE_HELPER_API_V5_URL + "/patreon-login") +
		//"&scope=pledges-to-me" +
		"&state=" +
		Settings.get("general.uuid", false);
}

/**
 * Function to handle the collapsible fieldsets
 */
function initiateTogglers() {
	document.querySelectorAll("a.toggle").forEach((link) => {
		link.addEventListener("click", (event) => {
			const container = link.parentElement.parentElement.querySelector("div.toggle-container");
			const toggleIcon = link.querySelector("div");
			if (toggleIcon.classList.contains("vh-icon-toggler-down")) {
				toggleIcon.classList.remove("vh-icon-toggler-down");
				toggleIcon.classList.add("vh-icon-toggler-right");

				container.style.display = "none";
			} else {
				toggleIcon.classList.remove("vh-icon-toggler-right");
				toggleIcon.classList.add("vh-icon-toggler-down");

				container.style.display = "block";
			}
		});
	});
}

/**
 * Test a title against all keywords
 */
function initiateTestKeywords() {
	const titleObj = document.querySelector("#testTitle");
	titleObj.addEventListener("keyup", (event) => {
		const title = titleObj.value;
		testKeyword("general.highlightKeywords", title);
		testKeyword("general.hideKeywords", title);
	});
}

function testKeyword(key, title) {
	const keyE = CSS.escape(key);

	const lines = document.querySelectorAll(`#${keyE} table>tr`);
	for (let i = 0; i < lines.length; i++) {
		let regex;
		const containsObj = lines[i].querySelector(`td input[name="contains"]`);
		const contains = containsObj.value.trim();
		regex = new RegExp(`\\b${contains}\\b`, "i");
		if (regex.test(title)) {
			containsObj.style.background = "lightgreen";
		} else {
			containsObj.style.background = "white";
		}

		const withoutObj = lines[i].querySelector(`td input[name="without"]`);
		const without = withoutObj.value.trim();
		regex = new RegExp(`\\b${without}\\b`, "i");
		if (regex.test(title) && without != "") {
			withoutObj.style.background = "lightgreen";
		} else {
			withoutObj.style.background = "white";
		}
	}
}

/**
 * This function convert both ways */
function keywordsTypeToSettingKey(type) {
	switch (type) {
		case "highlight":
			return "general.highlightKeywords";
		case "hidden":
			return "general.hideKeywords";
		case "blur":
			return "general.blurKeywords";

		//Reverse
		case "general.highlightKeywords":
			return "highlight";
		case "general.hideKeywords":
			return "hidden";
		case "general.blurKeywords":
			return "blur";
	}
	return null;
}

function remoteSaveList(keywordType) {
	const settingKey = keywordsTypeToSettingKey(keywordType);
	const keyE = CSS.escape(settingKey);
	const btnSave = document.querySelector(`#${keyE} input[name="save"]`);
	if (btnSave && confirm("Save highlight keywords first?")) {
		btnSave.click();
	}
	if (confirm("Overwrite remote stored keywords with the saved list?")) {
		const content = {
			api_version: 5,
			country: "loremipsum",
			uuid: Settings.get("general.uuid", false),
			action: "save_keywords",
			keywords_type: keywordType,
			keywords: Settings.get(settingKey),
		};
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(VINE_HELPER_API_V5_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		}).then(async function (response) {
			alert("List saved remotely");
		});
	}
}
function remoteLoadList(keywordsType) {
	if (confirm("Load remote list and overwrite local list?")) {
		const content = {
			api_version: 5,
			country: "loremipsum",
			uuid: Settings.get("general.uuid", false),
			action: "get_keywords",
			keywords: keywordsType,
		};
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(VINE_HELPER_API_V5_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		})
			.then((response) => response.json())
			.then(async function (data) {
				let key;
				let textList = data.keywords_type == "blur";
				key = keywordsTypeToSettingKey(data.keywords_type);

				let keyE = CSS.escape(key);
				if (textList) {
					const obj = document.querySelector(`textarea[name='${keyE}']`);
					obj.value = data.keywords.join(", ");

					//Save the new content
					const event = new Event("change");
					obj.dispatchEvent(event);
				} else {
					data.keywords.sort((a, b) => {
						if (a.contains.toLowerCase() < b.contains.toLowerCase()) return -1;
						if (a.contains.toLowerCase() > b.contains.toLowerCase()) return 1;
						return 0;
					});

					//Remove all the existing lines
					const rows = document.querySelectorAll(`#${keyE} table>tr`);
					rows.forEach((row) => row.remove());

					//Add new lines for the remote content
					for (let i = 0; i < data.keywords.length; i++) {
						if (typeof data.keywords[i] == "string") {
							//Load the old data format
							manageKeywordsAddLine(key, data.keywords[i], "", "", "");
						} else if (typeof data.keywords[i] == "object") {
							//Load the new data format
							manageKeywordsAddLine(
								key,
								data.keywords[i].contains,
								data.keywords[i].without,
								data.keywords[i].etv_min,
								data.keywords[i].etv_max
							);
						}
					}
				}
			});
	}
}

//CSK: Comma Separated Keywords
function manageTextareaCSK(key) {
	const val = Settings.get(key);
	const keywordType = keywordsTypeToSettingKey(key);
	const obj = document.querySelector(`textarea[name='${key}']`);
	if (obj == null) {
		alert("Textarea name='" + key + "' does not exist");
		throw new Error("Textarea name='" + key + "' does not exist");
	}
	obj.value = val === undefined ? "" : val.join(", ");
	obj.addEventListener("change", async function () {
		let arr = [];
		arr = obj.value
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item !== "");
		if (arr.length == 1 && arr[0] == "") {
			arr = [];
		}

		Settings.set(key, arr);
	});

	//Bind buttons
	document.getElementById(`save${keywordType}Keywords`).addEventListener("click", async () => {
		remoteSaveList(keywordType);
	});
	document.getElementById(`load${keywordType}Keywords`).addEventListener("click", async () => {
		remoteLoadList(keywordType);
	});
}

function manageKeywords(key) {
	const val = Settings.get(key);
	const keywordType = keywordsTypeToSettingKey(key);
	const keyE = CSS.escape(key);

	//Build the keywords GUI
	const btnAdd = document.querySelector(`#${keyE} input[name="add"]`);
	btnAdd.addEventListener("click", () => {
		manageKeywordsAddLine(key, "", "", "", "");
	});
	const btnSave = document.querySelector(`#${keyE} input[name="save"]`);
	btnSave.addEventListener("click", async () => {
		btnSave.disabled = true;
		let arrContent = [];
		const lines = document.querySelectorAll(`#${keyE} table>tr`);
		for (let i = 0; i < lines.length; i++) {
			const contains = lines[i].querySelector(`td input[name="contains"]`).value.trim();
			const without = lines[i].querySelector(`td input[name="without"]`).value.trim();
			const etv_min = lines[i].querySelector(`td input[name="etv_min"]`).value.trim();
			const etv_max = lines[i].querySelector(`td input[name="etv_max"]`).value.trim();

			//Skip empty lines
			if (contains == "" && without == "" && etv_min == "" && etv_max == "") {
				continue;
			}
			arrContent.push({
				contains: contains,
				without: without,
				etv_min: etv_min,
				etv_max: etv_max,
			});
		}
		await Settings.set(key, arrContent);
		await new Promise((r) => setTimeout(r, 500)); //Wait to give user-feedback.
		btnSave.disabled = false;
	});

	//Sort the list
	if (typeof val[0] == "object") {
		val.sort((a, b) => {
			if (a.contains.toLowerCase() < b.contains.toLowerCase()) return -1;
			if (a.contains.toLowerCase() > b.contains.toLowerCase()) return 1;
			return 0;
		});
	}

	//Populate the list
	for (let i = 0; i < val.length; i++) {
		if (typeof val[i] == "string") {
			//Load the old data format
			manageKeywordsAddLine(key, val[i], "", "", "");
		} else if (typeof val[i] == "object") {
			//Load the new data format
			manageKeywordsAddLine(key, val[i].contains, val[i].without, val[i].etv_min, val[i].etv_max);
		}
	}

	//Bind buttons
	document.getElementById(`save${keywordType}Keywords`).addEventListener("click", async () => {
		remoteSaveList(keywordType);
	});
	document.getElementById(`load${keywordType}Keywords`).addEventListener("click", async () => {
		remoteLoadList(keywordType);
	});

	document.getElementById(`bulkDelete${keywordType}`).addEventListener("click", async () => {
		if (confirm("Delete all?")) {
			//Remove all the existing lines
			const rows = document.querySelectorAll(`#${keyE} table>tr`);
			rows.forEach((row) => row.remove());
		}
	});

	document.getElementById(`bulkImport${keywordType}`).addEventListener("click", async () => {
		const rawContent = prompt("Paste your comma separated content:");
		let arr = [];
		arr = rawContent
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item !== "");
		for (let i = 0; i < arr.length; i++) {
			manageKeywordsAddLine(key, arr[i], "", "", "");
		}
	});
}

function manageRadio(key) {
	const keyE = CSS.escape(key);

	document.querySelectorAll(`input[name="${keyE}"]`).forEach((elem) => {
		if (elem.value == Settings.get(key)) {
			elem.checked = true;
		}

		elem.addEventListener("click", () => {
			Settings.set(key, elem.value);
		});
	});
}
function manageKeywordsAddLine(key, contains, without, etv_min, etv_max) {
	const keyE = CSS.escape(key);
	const table = document.querySelector(`#${keyE} table`);
	const tr = document.createElement("tr");
	table.append(tr);

	const td1 = document.createElement("td");
	tr.append(td1);
	const input1 = document.createElement("input");
	input1.type = "text";
	input1.style.width = "98%";
	input1.name = "contains";
	input1.value = contains;
	td1.append(input1);

	const td2 = document.createElement("td");
	tr.append(td2);
	const input2 = document.createElement("input");
	input2.type = "text";
	input2.style.width = "98%";
	input2.name = "without";
	input2.value = without;
	td2.append(input2);

	const td3 = document.createElement("td");
	tr.append(td3);
	const input3 = document.createElement("input");
	input3.type = "text";
	input3.name = "etv_min";
	input3.style.width = "90%";
	input3.value = etv_min;
	td3.append(input3);

	const td4 = document.createElement("td");
	tr.append(td4);
	const input4 = document.createElement("input");
	input4.type = "text";
	input4.name = "etv_max";
	input4.style.width = "90%";
	input4.value = etv_max;
	td4.append(input4);

	const td5 = document.createElement("td");
	tr.append(td5);
	const input5 = document.createElement("input");
	input5.type = "button";
	input5.classList.add("vh-icon-trash");
	input5.name = "remove";
	input5.value = " ";
	input5.addEventListener("click", () => {
		if (confirm("Delete?")) {
			tr.remove();
		}
	});
	td5.append(input5);
}

function manageTextarea(key) {
	const val = Settings.get(key);
	const obj = document.querySelector(`textarea[name='${key}']`);
	if (obj == null) {
		throw new Error("Textarea name='" + key + "' does not exist");
	}
	obj.value = val;
	obj.addEventListener("change", async function () {
		Settings.set(key, obj.value);
	});
}

function manageInputText(key) {
	const val = Settings.get(key);
	const obj = document.querySelector(`label[for='${key}'] input`);
	if (obj == null) {
		throw new Error("Keybinding input name='" + key + "' does not exist");
	}
	obj.value = val == null ? "" : val;

	obj.addEventListener("change", async function () {
		Settings.set(key, obj.value);
	});
}

function manageColorPicker(key) {
	const val = Settings.get(key);
	const keyE = CSS.escape(key);
	const obj = document.querySelector(`input[name='${keyE}']`);
	if (obj == null) {
		throw new Error("Color picker input name='" + key + "' does not exist");
	}
	obj.value = val == null ? "" : val;

	obj.addEventListener("change", async function () {
		Settings.set(key, obj.value);
	});
}

function manageSlider(key) {
	const val = Settings.get(key);
	const volumeObj = document.querySelector(`label[for='${key}'] input`);
	if (volumeObj == null) {
		throw new Error("Slider input name='" + key + "' does not exist");
	}
	volumeObj.value = Number(val == null ? 0 : val);
	volumeObj.addEventListener("change", async function () {
		Settings.set(key, volumeObj.value);
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
	const val = Settings.get(key);
	const keyE = CSS.escape(key);
	const selectObj = document.querySelector(`label[for='${keyE}'] select`);

	for (let i = 0; i < selectObj.options.length; i++) {
		if (selectObj.options[i].value == val) {
			selectObj.options[i].selected = true;
		}
	}

	selectObj.addEventListener("change", async function () {
		Settings.set(key, selectObj.value);
	});
}

function manageCheckboxSetting(key, def = null) {
	const val = def === null ? Settings.get(key) : def;
	const keyE = CSS.escape(key);
	const checkObj = document.querySelector(`input[name='${keyE}']`);
	checkObj.checked = val;

	//Trigger the change event so the fieldset will update accordingly.
	const event = new Event("change");
	checkObj.dispatchEvent(event);

	//Saving the change
	checkObj.addEventListener("change", async function () {
		//Change in value
		Settings.set(key, checkObj.checked);
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

export { initiateSettings };
