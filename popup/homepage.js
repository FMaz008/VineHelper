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
	cb.checked = value;

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
	let keyE = CSS.escape(key);
	let checked = document.querySelector(`input[name='${keyE}']`).checked;
	let keyF = null;

	if (key == "hiddenTab.active") {
		keyF = CSS.escape("hiddenTab.remote");
		document.querySelector(`[name='${keyF}']`).disabled = !checked;
	}
	if (key == "general.newItemNotification") {
		keyF = CSS.escape("general.newItemNotificationSound");
		document.querySelector(`[name='${keyF}']`).disabled = !checked;
	}

	if (key == "general.displayFirstSeen") {
		keyF = CSS.escape("general.bookmark");
		document.querySelector(`[name='${keyF}']`).disabled = !checked;
	}
}
async function drawUnavailableTab() {
	document.querySelector("#votingToolbarOptions").style.display = appSettings
		.unavailableTab.votingToolbar
		? "block"
		: "none";

	if (appSettings.unavailableTab.votingToolbar) {
		/*
        //Obtain contribution statistics
        let url = "https://www.francoismazerolle.ca/vinehelperStats.php";
        fetch(url)
            .then((response) => response.json())
            .then(serverResponse)
            .catch((error) => console.log(error));

        function serverResponse(data) {
            let percentage = (data["votes"] * 100) / data["totalVotes"];
			let reliability = 0;
			
			if(data["reviewedVotes"] > 0)
				reliability = (data["concensusBackedVotes"] * 100) / data["reviewedVotes"];
				
			
            document.querySelector("#votes").innerText= data["votes"];
            document.querySelector("#contribution").innerText= percentage.toFixed(3) + "%";
            document.querySelector("#rank").innerText= "#" + data["rank"];
            document.querySelector("#available").innerText= data["totalConfirmed"];
            document.querySelector("#unavailable").innerText= data["totalDiscarded"];
            document.querySelector("#totalUsers").innerText= data["totalUsers"];
            document.querySelector("#totalVotes").innerText= data["totalVotes"];
            document.querySelector("#totalProducts").innerText= data["totalProducts"];
            document.querySelector("#reviewedVotes").innerText= data["reviewedVotes"];
            document.querySelector("#concensusBackedVotes").innerText= data["concensusBackedVotes"];
            document.querySelector("#reliability").innerText= reliability.toFixed(1) + "%";
        }
        */
	}
}

async function drawDiscord() {
	//Show or hide the discord options
	document.querySelector("#discordOptions").style.display = appSettings
		.discord.active
		? "block"
		: "none";

	if (appSettings.discord.active) {
		let showLink = JSONGetPathValue(appSettings, "discord.guid") === null;

		document.querySelector("#discord-guid-link").style.display = showLink
			? "block"
			: "none";
		document.querySelector("#discord-guid-unlink").style.display = showLink
			? "none"
			: "block";
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

	//$("#tabs").tabs();
	//$("input[type='checkbox']").checkboxradio();

	drawUnavailableTab();
	drawDiscord();

	//###################
	//#### UI interaction

	//unavailableTab / Voting system interaction
	let key;
	key = CSS.escape("unavailableTab.votingToolbar");
	document.querySelector(`label[for='${key}'] input`).onclick = function () {
		setTimeout(() => drawUnavailableTab(), 1);
	};

	key = CSS.escape("discord.active");
	document.querySelector(`label[for='${key}'] input`).onclick = function () {
		setTimeout(() => drawDiscord(), 1);
	};

	//Load/save settings:
	key = CSS.escape("unavailableTab.consensusThreshold");
	document.querySelector(`#${key}`).value =
		appSettings.unavailableTab.consensusThreshold;
	document.querySelector(`#${key}`).onchange = async function () {
		let val = this.value;
		if (isNumeric(val) && val > 0 && val < 10) {
			appSettings.unavailableTab.consensusThreshold = val;
			await chrome.storage.local.set({ settings: appSettings });
		}
	};

	key = CSS.escape("unavailableTab.unavailableOpacity");
	document.querySelector(`#${key}`).value =
		appSettings.unavailableTab.unavailableOpacity;
	document.querySelector(`#${key}`).onchange = async function () {
		let val = this.value;
		if (isNumeric(val) && val > 0 && val <= 100) {
			appSettings.unavailableTab.unavailableOpacity = val;
			await chrome.storage.local.set({ settings: appSettings });
		}
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

		let url =
			"https://www.francoismazerolle.ca/vinehelper.php" +
			"?data=" +
			jsonArrURL;
		await fetch(url)
			.then((response) => response.json())
			.then(async function (serverResponse) {
				if (serverResponse["ok"] == "ok") {
					appSettings.general.uuid = serverResponse["uuid"];
					await chrome.storage.local.set({ settings: appSettings });
				} else {
					alert("Invalid UUID");
					key = CSS.escape("general.uuid");
					document.querySelector(`#${key}`).value =
						appSettings.general.uuid;
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
		let url =
			"https://api.llamastories.com/brenda/user/" +
			document.querySelector("#" + key).value;
		const response = await fetch(url, { method: "GET" });
		if (response.status == 200) {
			appSettings.discord.guid = document.querySelector(`#${key}`).value;
			await chrome.storage.local.set({ settings: appSettings });
			document.querySelector("#guid-txt").innerText =
				appSettings.discord.guid;
			document.querySelector("#discord-guid-link").style.display = "none";
			document.querySelector("#discord-guid-unlink").style.display =
				"block";
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

	manageCheckboxSetting("general.topPagination");
	manageCheckboxSetting("general.versionInfoPopup", false);
	manageCheckboxSetting("general.firstVotePopup");
	manageCheckboxSetting("general.shareData");
	manageCheckboxSetting("general.displayETV");
	manageCheckboxSetting("general.displayVariantIcon");
	manageCheckboxSetting("general.displayFirstSeen");
	manageCheckboxSetting("general.bookmark");
	manageCheckboxSetting("general.newItemNotification");
	manageCheckboxSetting("general.newItemNotificationSound");
	manageCheckboxSetting("hiddenTab.active");
	manageCheckboxSetting("hiddenTab.remote");
	manageCheckboxSetting("discord.active"); //Handled manually
	manageCheckboxSetting("unavailableTab.active");
	manageCheckboxSetting("unavailableTab.votingToolbar");
	manageCheckboxSetting("unavailableTab.selfDiscard");
	manageCheckboxSetting("unavailableTab.compactToolbar");
	manageCheckboxSetting("unavailableTab.consensusDiscard");

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

	manageCheckboxSetting("reviews.showProductTitle"); 
	manageCheckboxSetting("reviews.fancyButtonStyling"); 
}

function manageCheckboxSetting(key, def = null) {
	let val = def === null ? JSONGetPathValue(appSettings, key) : def;
	setCB(key, val); //Initial setup

	let keyE = CSS.escape(key);

	//Clicking the label will check the checkbox
	document.querySelector(`label[for='${keyE}']`).onclick = async function (
		event
	) {
		if (event.target.nodeName == "INPUT") return false;

		//Change the value
		const newValue = getCB(key);
		setCB(key, !newValue);

		const e = new Event("change");
		const element = document.querySelector(`input[name='${keyE}']`);
		element.dispatchEvent(e);
	}.bind(keyE);
	document.querySelector(`input[name='${keyE}']`).onchange =
		async function () {
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
			currentKey = parseInt(
				currentKey.substring(1, currentKey.length - 1)
			);
		}
		if (nextKey && nextKey.includes("[")) {
			nextKey = parseInt(nextKey.substring(1, nextKey.length - 1));
		}

		if (typeof nextKey !== "undefined") {
			obj[currentKey] = obj[currentKey]
				? obj[currentKey]
				: isNaN(nextKey)
				? {}
				: [];
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
