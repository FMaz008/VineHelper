import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
const Settings = new SettingsMgr();

import { Environment } from "/scripts/core/services/Environment.js";
const env = new Environment();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
const i13n = new Internationalization();

import { HiddenListMgr } from "/scripts/core/services/HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

import { DeviceFingerprintMgr } from "/scripts/core/services/DeviceFingerprintMgr.js";
var fingerprintMgr = new DeviceFingerprintMgr(Settings);

import { DeviceMgr } from "/scripts/core/services/DeviceMgr.js";
var deviceMgr = new DeviceMgr(Settings);

import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

import { compileKeywordObjects } from "/scripts/core/utils/KeywordCompiler.js";

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

	//If the browser is firefox, replace all the input[type="color"] with input[type="text"]
	if (navigator.userAgent.includes("Firefox") && typeof window.popupView !== "undefined") {
		document.querySelectorAll("input[type='color']").forEach(function (item) {
			item.type = "text";
		});
	}

	//Handle premium feature access
	[1, 2, 3].forEach((tier) => {
		if (!Settings.isPremiumUser(tier)) {
			document
				.querySelectorAll(
					`.premium-feature-${tier} input, .premium-feature-${tier} select, .premium-feature-${tier} button, .premium-feature-${tier} textarea`
				)
				.forEach((item) => {
					item.disabled = true;
				});
		}
	});

	const tierLevel = Settings.get("general.patreon.tier");

	const tierCharacters = {
		0: {
			name: "Commoner",
			image: "character-tier-0.png",
			description:
				"The Commoner weaves through the bustling market, blending with the crowd. Keen-eyed and shrewd, they know every deal, every shortcut, and every hidden gem.",
		},
		1: {
			name: "Omni Curator",
			image: "character-tier-1.png",
			description:
				"The Omni Curator shops with masterful precision, crafting lists like enchanted scrolls. Every item chosen holds purpose, every purchase a step toward perfection.",
		},
		2: {
			name: "Gearmancer",
			image: "character-tier-2.png",
			description:
				"The Gearmancer strides through the market, armed with precision tools for every task. No gadget is too rare, no mechanism beyond their mastery.",
		},
		3: {
			name: "Antiquarian Scout",
			image: "character-tier-3.png",
			description:
				"The Antiquarian Scout navigates the market with wisdom, one of the rare few granted access to the hidden archives where secrets of past wares reside.",
		},
	};
	document.getElementById("premiumTier").innerText = tierCharacters[tierLevel].name;
	document.getElementById("premiumCharacter").src = chrome.runtime.getURL(
		"resource/image/" + tierCharacters[tierLevel].image
	);
	document.getElementById("patreonCharacterDescription").innerText = tierCharacters[tierLevel].description;

	if (tierLevel >= 3) {
		document.getElementById("patreonLevelbarTier3").classList.add("filled3");
	}
	if (tierLevel >= 2) {
		document.getElementById("patreonLevelbarTier2").classList.add("filled2");
	}
	if (tierLevel >= 1) {
		document.getElementById("patreonLevelbarTier1").classList.add("filled1");
	}
	if (tierLevel >= 0) {
		document.getElementById("patreonLevelbarTier0").classList.add("filled0");
	}

	//Handle removing push notifications for safari
	try {
		if (!env.isSafari()) {
			chrome.permissions.contains({ permissions: ["notifications"] }, (result) => {
				if (!result) {
					document.querySelector("#notification.pushNotifications").disabled = true;
					document.querySelector("#notification.pushNotificationsAFA").disabled = true;
				}
			});
		}
	} catch (err) {
		//Do nothing.
	}

	//Show the usage time in days and hours
	const minutesUsed = Settings.get("metrics.minutesUsed");
	const days = Math.floor(minutesUsed / 1440);
	const hours = Math.floor((minutesUsed % 1440) / 60);
	const minutes = minutesUsed % 60;
	document.getElementById("usageTime").innerText =
		days + " day(s) and " + hours + " hour(s) and " + minutes + " minute(s)";

	//Get the user's stats from the API
	if (Settings.get("general.uuid", false)) {
		const content = {
			api_version: 5,
			app_version: env.data.appVersion,
			action: "get_user_stats",
			country: i13n.getCountryCode(),
			uuid: Settings.get("general.uuid", false),
		};
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();
		fetch(env.getAPIUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		}).then(async function (response) {
			const data = await response.json();
			document.getElementById("itemsFound").innerText = data.items_found == undefined ? "N/A" : data.items_found;
			document.getElementById("itemsFoundRank").innerText =
				data.items_found_rank == undefined ? "N/A" : data.items_found_rank + rankSuffix(data.items_found_rank);
			document.getElementById("etvFound").innerText = data.etv_found == undefined ? "N/A" : data.etv_found;
			document.getElementById("etvFoundRank").innerText =
				data.etv_found_rank == undefined ? "N/A" : data.etv_found_rank + rankSuffix(data.etv_found_rank);
			document.getElementById("devicesLinkedToUUID").innerHTML = data.devices
				.map(
					(device) =>
						`<li class="device-item" data-id="${device.id}">${device.name} (<a href="#" class="delete_device" data-id="${device.id}" data-name="${device.name}">unlink</a>)</li>`
				)
				.join("");

			document.querySelectorAll(".delete_device").forEach((item) => {
				item.onclick = async function (e) {
					e.preventDefault();
					const deviceName = item.dataset.name;
					if (confirm("Unlink device " + deviceName + " from this UUID?")) {
						await fingerprintMgr.deleteDevice(item.dataset.id);
						//Remove the item from the list
						const deviceItem = document.querySelector(`.device-item[data-id="${item.dataset.id}"]`);
						if (deviceItem) {
							deviceItem.remove();
						}
					}
				};
			});
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
	manageCheckboxSetting("general.detailsIcon");
	manageCheckboxSetting("general.displayETV");
	manageCheckboxSetting("general.displayModalETV");
	manageCheckboxSetting("general.displayFullTitleTooltip");
	manageCheckboxSetting("general.displayVariantIcon");
	manageCheckboxSetting("general.displayVariantButton");
	manageCheckboxSetting("general.displayFirstSeen");
	manageCheckboxSetting("general.bookmark");
	manageCheckboxSetting("hiddenTab.active");
	manageCheckboxSetting("hiddenTab.scrollToRFY", false);
	manageCheckboxSetting("pinnedTab.active");
	manageCheckboxSetting("unavailableTab.active");
	manageCheckboxSetting("general.modalNavigation");
	manageCheckboxSetting("general.searchOpenModal");
	manageCheckboxSetting("general.listView");
	manageCheckboxSetting("general.forceTango");
	manageCheckboxSetting("general.scrollToRFY");
	manageCheckboxSetting("general.hideOptOutButton");
	manageCheckboxSetting("general.hideRecommendations");
	manageCheckboxSetting("general.hideSideCart");
	manageCheckboxSetting("general.hideCategoriesRFYAFA");
	manageCheckboxSetting("general.reviewToolbar");
	manageCheckboxSetting("general.hideNoNews");
	manageCheckboxSetting("general.tileSize.enabled");
	manageCheckboxSetting("general.tileSize.active");
	manageCheckboxSetting("general.projectedAccountStatistics");
	manageCheckboxSetting("general.discoveryFirst");
	manageCheckboxSetting("general.blindLoading");
	manageCheckboxSetting("general.skipPrimeAd");
	manageColorPicker("general.bookmarkColor");
	manageCheckboxSetting("general.highlightColor.active");
	manageColorPicker("general.highlightColor.color");
	manageCheckboxSetting("general.highlightColor.ignore0ETVhighlight");
	manageCheckboxSetting("general.highlightColor.ignoreUnknownETVhighlight");
	manageCheckboxSetting("general.zeroETVHighlight.active");
	manageColorPicker("general.zeroETVHighlight.color");
	manageCheckboxSetting("general.unknownETVHighlight.active");
	manageColorPicker("general.unknownETVHighlight.color");
	manageColorPicker("general.toolbarBackgroundColor");

	//## TAB - DEBUG
	manageCheckboxSetting("general.debugTabTitle");
	manageCheckboxSetting("general.debugPlaceholders");
	manageCheckboxSetting("general.debugTitleDisplay");
	manageCheckboxSetting("general.debugMemory");
	manageCheckboxSetting("general.debugMemoryAutoSnapshot");
	manageCheckboxSetting("general.debugKeywords", false);
	manageCheckboxSetting("general.debugBulkOperations", false);
	manageCheckboxSetting("general.debugWebsocket", false);
	manageCheckboxSetting("general.debugServercom", false);
	manageCheckboxSetting("general.debugServiceWorker", false);
	manageCheckboxSetting("general.debugSettings", false);
	manageCheckboxSetting("general.debugStorage", false);
	manageCheckboxSetting("general.debugSound", false);
	manageCheckboxSetting("general.debugCoordination", false);
	manageCheckboxSetting("general.debugDuplicates", false);
	manageCheckboxSetting("general.debugVisibility", false);
	manageCheckboxSetting("general.debugItemProcessing", false);
	manageCheckboxSetting("general.debugTileCounter", false);

	//##TAB - NOTIFICATIONS

	manageCheckboxSetting("notification.active");
	manageCheckboxSetting("notification.pushNotifications");
	manageCheckboxSetting("notification.pushNotificationsAFA");
	manageCheckboxSetting("notification.screen.active");
	manageCheckboxSetting("notification.screen.thumbnail");
	manageCheckboxSetting("notification.monitor.listView");
	manageCheckboxSetting("notification.monitor.placeholders");
	manageCheckboxSetting("notification.hideList");
	manageCheckboxSetting("notification.monitor.hideGoldNotificationsForSilverUser");
	manageCheckboxSetting("notification.monitor.hideDuplicateThumbnail");
	manageCheckboxSetting("notification.reduce");
	manageCheckboxSetting("notification.monitor.zeroETV.colorActive");
	manageCheckboxSetting("notification.monitor.highlight.colorActive");
	manageCheckboxSetting("notification.monitor.unknownETV.colorActive");
	manageCheckboxSetting("notification.monitor.highlight.ignore0ETVhighlight");
	manageCheckboxSetting("notification.monitor.highlight.ignoreUnknownETVhighlight");
	manageRadio("notification.monitor.openLinksInNewTab");
	manageCheckboxSetting("notification.monitor.preventUnload");
	manageCheckboxSetting("notification.monitor.24hrsFormat");
	manageCheckboxSetting("notification.monitor.bump0ETV");
	manageCheckboxSetting("notification.monitor.mouseoverPause");
	manageCheckboxSetting("notification.monitor.pauseOverlay");
	manageTimeSetting("notification.autoload.hourStart");
	manageTimeSetting("notification.autoload.hourEnd");

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
	manageColorPicker("notification.monitor.unknownETV.color");

	//##TAB - SYSTEM
	manageCheckboxSetting("hiddenTab.remote");
	manageCheckboxSetting("pinnedTab.remote");
	manageCheckboxSetting("general.versionInfoPopup", false);
	manageCheckboxSetting("general.GDPRPopup", false);

	//Factory reset
	document.getElementById("factoryReset").addEventListener("click", async function () {
		if (
			await confirmPrompt(
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
		if (await confirmPrompt("Delete all locally stored hidden items from Vine Helper?")) {
			chrome.storage.local.set({ hiddenItems: [] });
			alert("Hidden items in local storage emptied.");
		}
		if (await confirmPrompt("Delete all remotely stored hidden items from Vine Helper?")) {
			const content = {
				api_version: 5,
				app_version: env.data.appVersion,
				country: Settings.get("general.country", false),
				action: "save_hidden_list",
				uuid: Settings.get("general.uuid", false),
				items: "DELETE_ALL",
			};
			const s = await cryptoKeys.signData(content);
			content.s = s;
			content.pk = await cryptoKeys.getExportedPublicKey();
			//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
			fetch(env.getAPIUrl(), {
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
			app_version: env.data.appVersion,
			country: Settings.get("general.country", false),
			action: "load_hidden_list",
			uuid: Settings.get("general.uuid", false),
		};
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(env.getAPIUrl(), {
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

	function dynamicPassword(id) {
		const key = CSS.escape(id);
		document.querySelector(`#${key}`).onmouseenter = () => {
			document.querySelector(`#${key}`).type = "text";
		};
		document.querySelector(`#${key}`).onmouseleave = () => {
			document.querySelector(`#${key}`).type = "password";
		};
	}

	//UUID/deviceId:
	dynamicPassword("generaluuid");
	document.getElementById(`generaluuid`).value = Settings.get("general.uuid", false);

	document.querySelector("#saveUUID").onclick = async function () {
		document.querySelector("#saveUUID").disabled = true;
		let key = CSS.escape("generaluuid");
		//Post a fetch request to confirm if the UUID is valid
		const uuid = document.querySelector("#" + key).value;

		try {
			await fingerprintMgr.updateUUID(uuid);
			alert("New UUID saved. Reload a vine page to reload your privileges.");
		} catch (error) {
			alert("Error saving UUID. Make sure the UUID is valid and try again.");
		}
		document.querySelector("#saveUUID").disabled = false;
	};

	manageInputText("general.deviceName");
	document.querySelector("#generateDeviceName").onclick = async function () {
		const key = CSS.escape("general.deviceName");
		const deviceName = await deviceMgr.generateDeviceName(false);
		document.querySelector("#" + key).value = deviceName;
	};
	document.querySelector("#saveDeviceName").onclick = async function () {
		try {
			let key = CSS.escape("generaluuid");
			const uuid = document.querySelector("#" + key).value;

			document.querySelector("#saveDeviceName").disabled = true;
			let deviceNameKey = CSS.escape("general.deviceName");
			let deviceName = document.querySelector("#" + deviceNameKey).value;
			await fingerprintMgr.updateDeviceName(uuid, deviceName);
			document.querySelector("#saveDeviceName").disabled = false;
		} catch (error) {
			alert(error);
			document.querySelector("#saveDeviceName").disabled = false;
		}
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
			await Settings.set("discord.guid", document.querySelector(`#${key}`).value);

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
	manageCheckboxSetting("general.highlightKWFirst");
	manageKeywords("general.highlightKeywords");
	manageKeywords("general.hideKeywords");
	manageTextareaCSK("general.blurKeywords");
	manageCheckboxSetting("general.unblurImageOnHover");
	initiateTogglers();
	initiateTestKeywords();

	const keywordsTesting = document.querySelector("#keywords-testing");
	const pinKeywordsTesting = document.querySelector("#pin-keywords-testing");
	if (pinKeywordsTesting) {
		pinKeywordsTesting.addEventListener("click", function () {
			if (pinKeywordsTesting.classList.contains("vh-icon-pin")) {
				pinKeywordsTesting.classList.remove("vh-icon-pin");
				pinKeywordsTesting.classList.add("vh-icon-unpin");
				keywordsTesting.style.position = "fixed";
				keywordsTesting.style.bottom = "10px";
				keywordsTesting.style.left = "50%";
				keywordsTesting.style.transform = "translateX(-50%)";
				keywordsTesting.style.backgroundColor = "white";
			} else {
				pinKeywordsTesting.classList.remove("vh-icon-unpin");
				pinKeywordsTesting.classList.add("vh-icon-pin");
				keywordsTesting.style.position = "relative";
				keywordsTesting.style.bottom = "unset";
				keywordsTesting.style.left = "unset";
				keywordsTesting.style.transform = "unset";
				keywordsTesting.style.backgroundColor = "unset";
			}
		});
	}

	//##TAB - KEYBINDINGS

	manageCheckboxSetting("keyBindings.active");
	manageInputText("keyBindings.pauseFeed");
	manageInputText("keyBindings.nextPage");
	manageInputText("keyBindings.previousPage");
	manageInputText("keyBindings.RFYPage");
	manageInputText("keyBindings.AFAPage");
	manageInputText("keyBindings.ALLPage");
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
	manageInputText("keyBindings.firstPage");

	//##TAB - STYLES

	manageCheckboxSetting("thorvarium.mobileios");
	manageCheckboxSetting("thorvarium.mobileandroid");
	manageCheckboxSetting("thorvarium.smallItems");
	manageCheckboxSetting("thorvarium.removeHeader");
	manageCheckboxSetting("thorvarium.removeFooter");
	manageCheckboxSetting("thorvarium.removeAssociateHeader");
	manageCheckboxSetting("thorvarium.darktheme", false);
	manageCheckboxSetting("thorvarium.ETVModalOnTop");
	manageCheckboxSetting("thorvarium.categoriesWithEmojis");
	manageCheckboxSetting("thorvarium.paginationOnTop");
	manageCheckboxSetting("thorvarium.collapsableCategories");
	manageCheckboxSetting("thorvarium.stripedCategories");
	manageCheckboxSetting("thorvarium.limitedQuantityIcon");
	manageCheckboxSetting("thorvarium.RFYAFAAITabs");
	manageTextarea("general.customCSS");

	//##TAB - ?

	if (!env.isSafari()) {
		//Copy buttons
		document.getElementById("copyBTC")?.addEventListener("click", function () {
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
		document.getElementById("copyETH")?.addEventListener("click", function () {
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
			encodeURIComponent(env.getAPIUrl() + "/patreon-login") +
			//"&scope=pledges-to-me" +
			"&state=" +
			Settings.get("general.uuid", false);

		//Patreon load page link:
		if (Settings.get("general.country") == null) {
			document.getElementById("RefreshVinePage").style.display = "none";
		} else {
			document.getElementById("RefreshVinePage").href =
				`https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore`;
		}
	}

	//Make the save button follow the scroll in the keyword tab
	const highlightKeywordsTable = document.querySelector("#general\\.highlightKeywords table");
	const highlightSaveButton = document.querySelector("#general\\.highlightKeywords input[name='save']");
	const highlightAddButton = document.querySelector("#general\\.highlightKeywords input[name='add']");
	const hideKeywordsTable = document.querySelector("#general\\.hideKeywords table");
	const hideSaveButton = document.querySelector("#general\\.hideKeywords input[name='save']");
	const hideAddButton = document.querySelector("#general\\.hideKeywords input[name='add']");
	window.addEventListener("scroll", () => {
		//if general.highlightKeywords table is displayed and the save button is not displayed in the current scroll position, make the scroll button position fixed

		if (
			isVisibleInViewport(highlightKeywordsTable, false, "highlightKeywordsTable") &&
			!isVisibleInViewport(highlightAddButton, true, "highlightAddButton")
		) {
			highlightSaveButton.style.position = "fixed";
			highlightSaveButton.style.bottom = "10px";
			highlightSaveButton.style.right = "10px";
		} else {
			highlightSaveButton.style.position = "relative";
		}

		if (
			isVisibleInViewport(hideKeywordsTable, false, "hideKeywordsTable") &&
			!isVisibleInViewport(hideAddButton, true, "hideAddButton")
		) {
			hideSaveButton.style.position = "fixed";
			hideSaveButton.style.bottom = "10px";
			hideSaveButton.style.right = "10px";
		} else {
			hideSaveButton.style.position = "relative";
		}
	});

	//Import/Export JSON Settings
	document.getElementById(`bulkImportJSONsettings`).addEventListener("click", async () => {
		displayMultiLinePopup("", "Paste your JSON content here...", "Import JSON", async (data) => {
			try {
				if (data == "") {
					throw new Error("Empty JSON data");
				}
				const json = JSON.parse(data);
				if (!json.settings) {
					throw new Error("Format Invalid");
				}
				await chrome.storage.local.set({ settings: json.settings });
				return true; //Hide the popup
			} catch (err) {
				alert("JSON data incomplete or invalid.");
				return false; //Keep the popup visible
			}
		});
	});

	//Export JSON
	document.getElementById(`bulkExportJSONsettings`).addEventListener("click", async () => {
		const json = await chrome.storage.local.get("settings");
		//Delete the settings.fingerprint.id
		delete json.settings.general.fingerprint;
		delete json.settings.crypto;
		displayMultiLinePopup(JSON.stringify(json));
	});

	//Import/Export JSON hidden items
	document.getElementById(`bulkImportJSONhidden`).addEventListener("click", async () => {
		displayMultiLinePopup("", "Paste your JSON content here...", "Import JSON", async (data) => {
			try {
				if (data == "") {
					throw new Error("Empty JSON data");
				}
				const json = JSON.parse(data);
				if (!json.hiddenItems) {
					throw new Error("Format Invalid");
				}
				await chrome.storage.local.set({ hiddenItems: json.hiddenItems });
				return true; //Hide the popup
			} catch (err) {
				alert("JSON data incomplete or invalid.");
				return false; //Keep the popup visible
			}
		});
	});

	//Export JSON
	document.getElementById(`bulkExportJSONhidden`).addEventListener("click", async () => {
		const json = await chrome.storage.local.get("hiddenItems");
		displayMultiLinePopup(JSON.stringify(json));
	});

	//Import/Export JSON pinned items
	document.getElementById(`bulkImportJSONpinned`).addEventListener("click", async () => {
		displayMultiLinePopup("", "Paste your JSON content here...", "Import JSON", async (data) => {
			try {
				if (data == "") {
					throw new Error("Empty JSON data");
				}
				const json = JSON.parse(data);
				if (!json.pinnedItems) {
					throw new Error("Format Invalid");
				}
				await chrome.storage.local.set({ pinnedItems: json.pinnedItems });
				return true; //Hide the popup
			} catch (err) {
				alert("JSON data incomplete or invalid.");
				return false; //Keep the popup visible
			}
		});
	});

	//Export JSON
	document.getElementById(`bulkExportJSONpinned`).addEventListener("click", async () => {
		const json = await chrome.storage.local.get("pinnedItems");
		displayMultiLinePopup(JSON.stringify(json));
	});

	initDualRangeSlider();
}

//Determine if a query selector is visible in the scrolled area
function isVisibleInViewport(element, fullyInView = true, debug) {
	if (!element) {
		throw new Error("Element is not found: " + debug);
	}

	const rect = element.getBoundingClientRect();
	const windowHeight = window.innerHeight;

	// Element is at least partially visible if:
	// - Its top is in view (top >= 0 && top < windowHeight)
	// - Its bottom is in view (bottom > 0 && bottom <= windowHeight)
	// - Or it spans the entire viewport (top <= 0 && bottom >= windowHeight)
	if (fullyInView) {
		return rect.top >= 0 && rect.bottom <= windowHeight;
	} else {
		return (
			(rect.top >= 0 && rect.top < windowHeight) ||
			(rect.bottom > 0 && rect.bottom <= windowHeight) ||
			(rect.top <= 0 && rect.bottom >= windowHeight)
		);
	}
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

	document.querySelector("#testTitleAgain").addEventListener("click", (event) => {
		const keyUpEvent = new Event("keyup");
		titleObj.dispatchEvent(keyUpEvent);
	});
}

import { findMatch } from "../scripts/core/utils/KeywordMatcher.js";
function testKeyword(key, title) {
	const keyE = CSS.escape(key);

	const lines = document.querySelectorAll(`#${keyE} table>tr`);
	for (let i = 0; i < lines.length; i++) {
		const containsObj = lines[i].querySelector(`td input[name="contains"]`);
		const contains = containsObj.value.trim();

		// Compile and test the keyword
		const compiledKeywords = compileKeywordObjects([{ contains: contains, without: "", etv_min: "", etv_max: "" }]);
		if (findMatch(title, compiledKeywords, null, null)) {
			containsObj.style.background = "lightgreen";
		} else {
			containsObj.style.background = "white";
		}

		const withoutObj = lines[i].querySelector(`td input[name="without"]`);
		const without = withoutObj.value.trim();

		// Test the 'without' field as if it were a 'contains' field
		const compiledWithout = compileKeywordObjects([{ contains: without, without: "", etv_min: "", etv_max: "" }]);
		if (findMatch(title, compiledWithout, null, null)) {
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

async function remoteSaveList(keywordType) {
	const settingKey = keywordsTypeToSettingKey(keywordType);
	const keyE = CSS.escape(settingKey);
	const btnSave = document.querySelector(`#${keyE} input[name="save"]`);
	if (btnSave && (await confirmPrompt("Save highlight keywords first?"))) {
		btnSave.click();
	}
	if (await confirmPrompt("Overwrite remote stored keywords with the saved list?")) {
		const content = {
			api_version: 5,
			app_version: env.data.appVersion,
			country: Settings.get("general.country", false),
			uuid: Settings.get("general.uuid", false),
			action: "save_keywords",
			keywords_type: keywordType,
			keywords: Settings.get(settingKey),
		};
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(env.getAPIUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		}).then(async function (response) {
			alert("List saved remotely");
		});
	}
}
async function remoteLoadList(keywordsType) {
	if (await confirmPrompt("Load remote list and overwrite local list?")) {
		const content = {
			api_version: 5,
			app_version: env.data.appVersion,
			country: Settings.get("general.country", false),
			uuid: Settings.get("general.uuid", false),
			action: "get_keywords",
			keywords: keywordsType,
		};
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(env.getAPIUrl(), {
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

function keywordsToJSON(key) {
	const keyE = CSS.escape(key);
	let arrContent = [];
	const lines = document.querySelectorAll(`#${keyE} table>tr`);
	for (let i = 0; i < lines.length; i++) {
		const contains = lines[i].querySelector(`td input[name="contains"]`).value.trim();
		const without = lines[i].querySelector(`td input[name="without"]`).value.trim();
		const etv_min = lines[i].querySelector(`td input[name="etv_min"]`).value.trim();
		const etv_max = lines[i].querySelector(`td input[name="etv_max"]`).value.trim();

		//Validate that contains and without have valid regex syntax
		try {
			new RegExp(contains);
		} catch (e) {
			alert("Invalid regex syntax: " + contains);
			lines[i].querySelector(`td input[name="contains"]`).focus();
		}
		try {
			new RegExp(without);
		} catch (e) {
			alert("Invalid regex syntax: " + without);
			lines[i].querySelector(`td input[name="without"]`).focus();
		}

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
	return arrContent;
}
function keywordsToCSV(key) {
	const keyE = CSS.escape(key);
	const lines = document.querySelectorAll(`#${keyE} table>tr`);

	//Create a CSV string of all the "contains" entries
	let csv = "";
	for (let i = 0; i < lines.length; i++) {
		const contains = lines[i].querySelector(`td input[name="contains"]`).value.trim();
		csv += contains + ",";
	}
	return csv;
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
		const arrContent = keywordsToJSON(key);
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

	document.getElementById(`bulkDelete${keywordType}keywords`).addEventListener("click", async () => {
		if (await confirmPrompt("Delete all?")) {
			//Remove all the existing lines
			const rows = document.querySelectorAll(`#${keyE} table>tr`);
			rows.forEach((row) => row.remove());
		}
	});

	//Import CSV
	document.getElementById(`bulkImportCSV${keywordType}keywords`).addEventListener("click", async () => {
		displayMultiLinePopup("", "Paste your CSV content here...", "Import CSV", (data) => {
			let arr = [];
			arr = data
				.split(",")
				.map((item) => item.trim())
				.filter((item) => item !== "");
			for (let i = 0; i < arr.length; i++) {
				manageKeywordsAddLine(key, arr[i], "", "", "");
			}
			return true;
		});
	});

	//Import JSON
	document.getElementById(`bulkImportJSON${keywordType}keywords`).addEventListener("click", async () => {
		displayMultiLinePopup("", "Paste your JSON content here...", "Import JSON", (data) => {
			try {
				const json = JSON.parse(data);
				for (let i = 0; i < json.length; i++) {
					manageKeywordsAddLine(key, json[i].contains, json[i].without, json[i].etv_min, json[i].etv_max);
				}
				return true; //Hide the popup
			} catch (err) {
				alert("JSON data incomplete or invalid.");
				return false; //Keep the popup visible
			}
		});
	});

	//Export CSV
	document.getElementById(`bulkExportCSV${keywordType}keywords`).addEventListener("click", async () => {
		const csv = keywordsToCSV(key);
		displayMultiLinePopup(csv);
	});

	//Export JSON
	document.getElementById(`bulkExportJSON${keywordType}keywords`).addEventListener("click", async () => {
		const json = keywordsToJSON(key);
		displayMultiLinePopup(JSON.stringify(json));
	});
}

function displayMultiLinePopup(content, placeholder = "", callbackLabel = null, callback = null) {
	//Create a popup with a textarea for multi-line input
	const popup = document.createElement("div");
	popup.style.position = "fixed";
	popup.style.top = "50%";
	popup.style.left = "50%";
	popup.style.transform = "translate(-50%, -50%)";
	popup.style.backgroundColor = "white";
	popup.style.border = "1px solid black";
	popup.style.width = "90%";
	popup.style.height = "200px";
	popup.style.padding = "20px";
	popup.style.paddingTop = "40px";
	popup.style.paddingBottom = "40px";
	popup.innerHTML =
		`<textarea id="textInput" style="width: 100%; height: 100%;margin-left:0;" placeholder="` +
		placeholder +
		`">` +
		content +
		`</textarea>
		<button id="closePopup" style="position: absolute; top: 5px; right: 5px;">X</button>`;
	if (callbackLabel != null) {
		popup.innerHTML =
			popup.innerHTML +
			`<button id="import" style="position: absolute; bottom: 10px; right: 10px;">` +
			callbackLabel +
			`</button>`;
	}
	document.body.appendChild(popup);

	document.getElementById("closePopup").addEventListener("click", () => {
		popup.remove();
	});

	if (callbackLabel != null) {
		document.getElementById("import").addEventListener("click", () => {
			if (callback != null) {
				const ret = callback(document.getElementById("textInput").value);
				if (ret) {
					popup.remove();
				}
			} else {
				popup.remove();
			}
		});
	}
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
	input5.addEventListener("click", async () => {
		if (await confirmPrompt("Delete?")) {
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

function manageTimeSetting(key) {
	const val = Settings.get(key);
	const obj = document.querySelector(`input[name='${key}']`);
	if (obj == null) {
		throw new Error("Time input name='" + key + "' does not exist");
	}
	obj.value = val == null ? "03:00" : val;

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
	let val = Settings.get(key);

	// If the setting doesn't exist and we have a default, use it and save it
	if (val === undefined && def !== null) {
		val = def;
		Settings.set(key, val); // Save the default value
	}

	if (val === undefined || val === null) {
		console.log("Setting " + key + " does not exist and no default provided");
		return;
	}

	const keyE = CSS.escape(key);
	const checkObj = document.querySelector(`input[name='${keyE}']`);
	if (checkObj == null) {
		console.log("Checkbox input name='" + key + "' does not exist");
		return;
	}

	checkObj.checked = val === true;

	//Trigger the change event so the fieldset will update accordingly.
	const event = new Event("change");
	checkObj.dispatchEvent(event);

	//Saving the change
	checkObj.addEventListener("change", async function () {
		//Change in value
		Settings.set(key, checkObj.checked);
	});

	//Clicking the label will check the checkbox
	const obj = document.querySelector(`label[for='${keyE}']`);
	if (!obj) {
		console.error("Label for '" + keyE + "' does not exist");
		return;
	}
	obj.onclick = async function (event) {
		if (event.target.nodeName == "INPUT") {
			return false;
		}

		//Change the value
		const element = document.querySelector(`input[name='${keyE}']`);
		element.click();
	}.bind(keyE);
}

//Return the suffix for the rank (st, nd, rd, th)
function rankSuffix(number) {
	if (number % 10 == 1 && number % 100 != 11) {
		return "st";
	} else if (number % 10 == 2 && number % 100 != 12) {
		return "nd";
	} else if (number % 10 == 3 && number % 100 != 13) {
		return "rd";
	}
	return "th";
}

function confirmPrompt(message) {
	return new Promise((resolve) => {
		// Create overlay
		const overlay = document.createElement("div");
		overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9998;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

		// Create confirm box
		const confirmBox = document.createElement("div");
		confirmBox.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 9999;
            min-width: 300px;
        `;

		// Add message
		const messageDiv = document.createElement("div");
		messageDiv.textContent = message;
		messageDiv.style.marginBottom = "20px";
		confirmBox.appendChild(messageDiv);

		// Add buttons container
		const buttonContainer = document.createElement("div");
		buttonContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        `;

		// Create buttons
		const okButton = document.createElement("button");
		okButton.textContent = "OK";
		okButton.style.cssText = `
            padding: 5px 15px;
            cursor: pointer;
            background: #4CAF50;
            border: none;
            color: white;
            border-radius: 3px;
        `;

		const cancelButton = document.createElement("button");
		cancelButton.textContent = "Cancel";
		cancelButton.style.cssText = `
            padding: 5px 15px;
            cursor: pointer;
            background: #f44336;
            border: none;
            color: white;
            border-radius: 3px;
        `;

		// Add buttons to container
		buttonContainer.appendChild(cancelButton);
		buttonContainer.appendChild(okButton);
		confirmBox.appendChild(buttonContainer);

		// Add confirm box to overlay
		overlay.appendChild(confirmBox);

		// Add overlay to body
		document.body.appendChild(overlay);

		// Handle button clicks
		const cleanup = () => {
			document.body.removeChild(overlay);
			document.removeEventListener("keydown", handleKeyPress);
		};

		const handleConfirm = () => {
			cleanup();
			resolve(true);
		};

		const handleCancel = () => {
			cleanup();
			resolve(false);
		};

		// Add click handlers
		okButton.addEventListener("click", handleConfirm);
		cancelButton.addEventListener("click", handleCancel);

		// Handle keyboard events
		const handleKeyPress = (e) => {
			if (e.key === "Enter") {
				handleConfirm();
			} else if (e.key === "Escape") {
				handleCancel();
			}
		};

		document.addEventListener("keydown", handleKeyPress);

		// Focus OK button
		okButton.focus();
	});
}

// Dual range slider
function initDualRangeSlider() {
	function controlFromInput(fromSlider, fromInput, toInput, controlSlider) {
		let [from, to] = getParsed(fromInput, toInput);
		const min = parseInt(fromInput.min, 10);
		const max = parseInt(fromInput.max, 10);
		if (from < min) {
			fromInput.value = min;
			from = min;
		}
		if (from > max) {
			fromInput.value = max;
			from = max;
		}
		if (from > to) {
			fromSlider.value = to;
			fromInput.value = to;
		} else {
			fromSlider.value = from;
		}
		fillSlider(fromInput, toInput, "#C6C6C6", "#25daa5", controlSlider);
		saveDualRangeSlider(from, to);
	}

	function controlToInput(toSlider, fromInput, toInput, controlSlider) {
		let [from, to] = getParsed(fromInput, toInput);
		const min = parseInt(toInput.min, 10);
		const max = parseInt(toInput.max, 10);
		if (to < min) {
			toInput.value = min;
			to = min;
		}
		if (to > max) {
			toInput.value = max;
			to = max;
		}
		setToggleAccessible(toInput);
		if (from <= to) {
			toSlider.value = to;
			toInput.value = to;
		} else {
			toInput.value = from;
		}
		fillSlider(fromInput, toInput, "#C6C6C6", "#25daa5", controlSlider);
		saveDualRangeSlider(from, to);
	}

	function controlFromSlider(fromSlider, toSlider, fromInput) {
		const [from, to] = getParsed(fromSlider, toSlider);
		const value = parseInt(fromSlider.value, 10);
		const min = parseInt(fromInput.min, 10);
		const max = parseInt(fromInput.max, 10);
		if (from > to) {
			fromSlider.value = to;
			fromInput.value = to;
		} else {
			if (value < min) {
				fromSlider.value = min;
			} else if (value > max) {
				fromSlider.value = max;
			} else {
				fromInput.value = from;
			}
		}
		fillSlider(fromSlider, toSlider, "#C6C6C6", "#25daa5", toSlider);
		saveDualRangeSlider(from, to);
	}

	function controlToSlider(fromSlider, toSlider, toInput) {
		const [from, to] = getParsed(fromSlider, toSlider);
		const value = parseInt(toSlider.value, 10);
		const min = parseInt(toInput.min, 10);
		const max = parseInt(toInput.max, 10);
		setToggleAccessible(toSlider);
		if (from <= to) {
			if (value < min) {
				toSlider.value = min;
			} else if (value > max) {
				toSlider.value = max;
			} else {
				toSlider.value = to;
				toInput.value = to;
			}
		} else {
			toInput.value = from;
			toSlider.value = from;
		}
		fillSlider(fromSlider, toSlider, "#C6C6C6", "#25daa5", toSlider);
		saveDualRangeSlider(from, to);
	}

	function getParsed(currentFrom, currentTo) {
		const from = parseInt(currentFrom.value, 10);
		const to = parseInt(currentTo.value, 10);
		return [from, to];
	}

	function fillSlider(from, to, sliderColor, rangeColor, controlSlider) {
		const rangeDistance = to.max - to.min;
		const fromPosition = from.value - to.min;
		const toPosition = to.value - to.min;
		controlSlider.style.background = `linear-gradient(
      to right,
      ${sliderColor} 0%,
      ${sliderColor} ${(fromPosition / rangeDistance) * 100}%,
      ${rangeColor} ${(fromPosition / rangeDistance) * 100}%,
      ${rangeColor} ${(toPosition / rangeDistance) * 100}%, 
      ${sliderColor} ${(toPosition / rangeDistance) * 100}%, 
      ${sliderColor} 100%)`;
	}

	function setToggleAccessible(currentTarget) {
		const toSlider = document.querySelector("#toSlider");
		if (Number(currentTarget.value) <= 0) {
			toSlider.style.zIndex = 2;
		} else {
			toSlider.style.zIndex = 0;
		}
	}

	function saveDualRangeSlider(from, to) {
		Settings.set("notification.autoload.min", from);
		Settings.set("notification.autoload.max", to);
	}

	function loadDualRangeSlider() {
		const from = Settings.get("notification.autoload.min") || 5;
		const to = Settings.get("notification.autoload.max") || 10;
		document.querySelector("#fromInput").value = from;
		document.querySelector("#toInput").value = to;
		controlFromInput(fromSlider, fromInput, toInput, toSlider);
		controlToInput(toSlider, fromInput, toInput, toSlider);
	}

	const fromSlider = document.querySelector("#fromSlider");
	const toSlider = document.querySelector("#toSlider");
	const fromInput = document.querySelector("#fromInput");
	const toInput = document.querySelector("#toInput");
	fillSlider(fromSlider, toSlider, "#C6C6C6", "#25daa5", toSlider);
	setToggleAccessible(toSlider);

	fromSlider.oninput = () => controlFromSlider(fromSlider, toSlider, fromInput);
	toSlider.oninput = () => controlToSlider(fromSlider, toSlider, toInput);
	fromInput.oninput = () => controlFromInput(fromSlider, fromInput, toInput, toSlider);
	toInput.oninput = () => controlToInput(toSlider, fromInput, toInput, toSlider);
	loadDualRangeSlider();
}

export { initiateSettings };
