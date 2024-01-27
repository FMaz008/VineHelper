//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.

var appSettings = {};
let manifest = chrome.runtime.getManifest();
appVersion = manifest.version;
$("#version").text(appVersion);

async function loadSettings() {
    const data = await chrome.storage.local.get("settings");
    Object.assign(appSettings, data.settings);
    init();
}
loadSettings();

function setCB(key, value) {
    $(`[name='${$.escapeSelector(key)}']`)
        .prop("checked", value)
        .checkboxradio("refresh");
	handleDynamicFields(key);
}

function getCB(key) {
    return $(`label[for='${$.escapeSelector(key)}'] input`).is(":checked");
}

function handleDynamicFields(key){
	if(key=="general.allowInjection"){
		$(`[name='${$.escapeSelector("general.shareETV")}']`)
			.checkboxradio( "option", { "disabled": !$(`label[for='${$.escapeSelector(key)}'] input`).is(":checked") }  )
			.checkboxradio("refresh");
			
		$(`[name='${$.escapeSelector("unavailableTab.shareOrder")}']`)
			.checkboxradio( "option", { "disabled": !$(`label[for='${$.escapeSelector(key)}'] input`).is(":checked") }  )
			.checkboxradio("refresh");
	}
	if(key=="hiddenTab.active"){
		$(`[name='${$.escapeSelector("hiddenTab.remote")}']`)
			.checkboxradio( "option", { "disabled": !$(`label[for='${$.escapeSelector(key)}'] input`).is(":checked") }  )
			.checkboxradio("refresh");
	}
    if(key=="general.newItemNotification"){
        $(`[name='${$.escapeSelector("general.newItemNotificationSound")}']`)
			.checkboxradio( "option", { "disabled": !$(`label[for='${$.escapeSelector(key)}'] input`).is(":checked") }  )
			.checkboxradio("refresh");
    }
}
async function drawUnavailableTab() {
    if (appSettings.unavailableTab.active) {
        $("#unavailableTabOptions").show();
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
				
			
            $("#votes").text(data["votes"]);
            $("#contribution").text(percentage.toFixed(3) + "%");
            $("#rank").text("#" + data["rank"]);
            $("#available").text(data["totalConfirmed"]);
            $("#unavailable").text(data["totalDiscarded"]);
            $("#totalUsers").text(data["totalUsers"]);
            $("#totalVotes").text(data["totalVotes"]);
            $("#totalProducts").text(data["totalProducts"]);
            $("#reviewedVotes").text(data["reviewedVotes"]);
            $("#concensusBackedVotes").text(data["concensusBackedVotes"]);
            $("#reliability").text(reliability.toFixed(1) + "%");
        }
    } else {
        $("#unavailableTabOptions").hide();
    }
}

async function drawDiscord() {
    if (appSettings.discord.active) {
        $("#discordOptions").show();

        if (JSONGetPathValue(appSettings, "discord.guid") === null) {
            $("#discord-guid-link").show();
            $("#discord-guid-unlink").hide();
        } else {
            $("#discord-guid-link").hide();
            $("#discord-guid-unlink").show();
        }
    } else $("#discordOptions").hide();
}

function init() {
    $("#tabs").tabs();
    $("input[type='checkbox']").checkboxradio();

    drawUnavailableTab();
    drawDiscord();

    //###################
    //#### UI interaction

    //unavailableTab / Voting system interaction
    $(`label[for='${$.escapeSelector("unavailableTab.active")}']`).on("click", function () {
        setTimeout(() => drawUnavailableTab(), 1);
    });

    $(`label[for='${$.escapeSelector("discord.active")}']`).on("click", function () {
        setTimeout(() => drawDiscord(), 1);
    });
	
	
	
	
    //Load/save settings:
    $("#" + $.escapeSelector("unavailableTab.consensusThreshold")).val(appSettings.unavailableTab.consensusThreshold);
    $("#" + $.escapeSelector("unavailableTab.consensusThreshold")).on("change", async function () {
        if (isNumeric($(this).val()) && $(this).val() > 0 && $(this).val() < 10) {
            appSettings.unavailableTab.consensusThreshold = $(this).val();
            await chrome.storage.local.set({ settings: appSettings });
        }
    });

    $("#" + $.escapeSelector("unavailableTab.unavailableOpacity")).val(appSettings.unavailableTab.unavailableOpacity);
    $("#" + $.escapeSelector("unavailableTab.unavailableOpacity")).on("change", async function () {
        if (isNumeric($(this).val()) && $(this).val() > 0 && $(this).val() <= 100) {
            appSettings.unavailableTab.unavailableOpacity = $(this).val();
            await chrome.storage.local.set({ settings: appSettings });
        }
    });
	

    //UUID:
    $("#" + $.escapeSelector("general.uuid")).on("mouseenter", function(){
        $("#" + $.escapeSelector("general.uuid")).attr("type", "text");
    });
    $("#" + $.escapeSelector("general.uuid")).on("mouseleave", function(){
        $("#" + $.escapeSelector("general.uuid")).attr("type", "password");
    });
    
    $("#" + $.escapeSelector("general.uuid")).val(appSettings.general.uuid);
    $("#saveUUID").on("click", async function () {
        $("#saveUUID").prop("disabled", true);

        //Post a fetch request to confirm if the UUID is valid
		let arrJSON = {"api_version":4, "action": "validate_uuid", "uuid": $("#" + $.escapeSelector("general.uuid")).val(), "country": "loremipsum"};
		let jsonArrURL = JSON.stringify(arrJSON);
		
        let url = "https://www.francoismazerolle.ca/vinehelper.php"
				+ "?data=" + jsonArrURL;
        await fetch(url)
			.then((response) => response.json())
			.then(async function(serverResponse){
				if(serverResponse["ok"] == "ok"){
					appSettings.general.uuid = serverResponse["uuid"];
					await chrome.storage.local.set({ settings: appSettings });
				}else{
					$("#" + $.escapeSelector("general.uuid")).val(appSettings.general.uuid);
				}
			})
			.catch( 
				function() {
					error =>  console.log(error);
				}
			);
        $("#saveUUID").prop("disabled", false);
    });
	
    $("#saveGUID").on("click", async function () {
        $("#saveGUID").prop("disabled", true);

        //Post a fetch request to the Brenda API from the AmazonVine Discord server
        //We want to check if the guid is valid.
        let url = "https://api.llamastories.com/brenda/user/" + $("#" + $.escapeSelector("discord.guid")).val();
        const response = await fetch(url, { method: "GET" });
        if (response.status == 200) {
            appSettings.discord.guid = $("#" + $.escapeSelector("discord.guid")).val();
            await chrome.storage.local.set({ settings: appSettings });
            $("#guid-txt").text(appSettings.discord.guid);
            $("#discord-guid-link").hide();
            $("#discord-guid-unlink").show();
        } else {
            $("#" + $.escapeSelector("discord.guid")).val("");
            alert("invalid API Token.");
        }
        $("#saveGUID").prop("disabled", false);
    });
    $("#unlinkGUID").on("click", async function () {
        appSettings.discord.guid = null;
        await chrome.storage.local.set({ settings: appSettings });

        $("#discord-guid-link").show();
        $("#discord-guid-unlink").hide();
    });

    function manageCheckboxSetting(key, def = null) {
		let val = def===null ? JSONGetPathValue(appSettings, key) : def;
		
        setCB(key, val);

        $(`label[for='${$.escapeSelector(key)}']`).on("click", async function () {
            const newValue = !getCB(key);
            JSONUpdatePathValue(appSettings, key, newValue);
            setCB(key, newValue);
            await chrome.storage.local.set({ settings: appSettings });
        });
    }
	
	

    manageCheckboxSetting("general.allowInjection");
    manageCheckboxSetting("general.topPagination");
    manageCheckboxSetting("general.versionInfoPopup", false);
    manageCheckboxSetting("general.firstVotePopup");
    manageCheckboxSetting("general.shareETV");
    manageCheckboxSetting("general.displayETV");
    manageCheckboxSetting("general.displayVariantIcon");
    manageCheckboxSetting("general.displayFirstSeen");
    manageCheckboxSetting("general.newItemNotification");
    manageCheckboxSetting("general.newItemNotificationSound");
    manageCheckboxSetting("hiddenTab.active");
    manageCheckboxSetting("hiddenTab.remote");
    manageCheckboxSetting("discord.active"); //Handled manually
    manageCheckboxSetting("unavailableTab.active");
    manageCheckboxSetting("unavailableTab.shareOrder");
    manageCheckboxSetting("unavailableTab.selfDiscard");
    manageCheckboxSetting("unavailableTab.compactToolbar");
    manageCheckboxSetting("unavailableTab.consensusDiscard");

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

//Utility functions

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

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

function JSONUpdatePathValue(obj, path, value) {
    let newData = JSONPathToObject(path, value);
    $.extend(true, obj, newData);
}

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


