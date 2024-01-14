//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.



var appSettings = {};


async function loadSettings(){
	const data = await chrome.storage.local.get("settings");
	Object.assign(appSettings, data.settings);
	init();
}
loadSettings();


function init(){
	if(appSettings.unavailableTab.active){
		//Obtain contribution statistics
		let url = "https://www.francoismazerolle.ca/vinehelperStats.php";
		fetch(url)
			.then((response) => response.json())
			.then(serverResponse)
			.catch( error =>  console.log(error) );

		function serverResponse(data){
			let percentage = data["votes"]*100/data["totalVotes"];
			
			$("#votes").text(data["votes"]);
			$("#contribution").text(percentage.toFixed(3) + "%");
			$("#rank").text("#" + data["rank"]);
			$("#available").text(data["totalConfirmed"]);
			$("#unavailable").text(data["totalDiscarded"]);
			$("#totalUsers").text(data["totalUsers"]);
		}
	}

	//###################
	//#### UI interaction
	
	//unavailableTab / Voting system interaction
	$("#" + $.escapeSelector("unavailableTab.active")).on("change", function(){
		if($(this).prop( "checked"))
			$("#unavailableTabOptions").show();
		else
			$("#unavailableTabOptions").hide();
	});
	if(!appSettings.unavailableTab.active){
		$("#unavailableTabOptions").hide();
	}
	
	
	//Discord link interaction
	$("#" + $.escapeSelector("discord.active")).on("change", function(){
		if($(this).prop( "checked"))
			$("#discordOptions").show();
		else
			$("#discordOptions").hide();
	});
	if(!JSONGetPathValue(appSettings, "discord.active")){
		$("#discordOptions").hide();
	}
	if(JSONGetPathValue(appSettings, "discord.guid") == null){
		$("#discord-guid-link").show();
		$("#discord-guid-unlink").hide();
	}else{
		$("#guid-txt").text(appSettings.discord.guid);
		$("#discord-guid-link").hide();
		$("#discord-guid-unlink").show();
	}
	
	





	//Load/save settings:
	$("#" + $.escapeSelector("unavailableTab.consensusThreshold")).val(appSettings.unavailableTab.consensusThreshold);
	$("#" + $.escapeSelector("unavailableTab.consensusThreshold")).on( "change", async function() {
		if(isNumeric($(this).val()) && $(this).val()>0 && $(this).val() <10){
			appSettings.unavailableTab.consensusThreshold = $(this).val();
			await chrome.storage.local.set({"settings": appSettings});
		}
	});


	$("#" + $.escapeSelector("unavailableTab.unavailableOpacity")).val(appSettings.unavailableTab.unavailableOpacity);
	$("#" + $.escapeSelector("unavailableTab.unavailableOpacity")).on( "change", async function() {
		if(isNumeric($(this).val()) && $(this).val()>0 && $(this).val() <=100){
			appSettings.unavailableTab.unavailableOpacity = $(this).val();
			await chrome.storage.local.set({"settings": appSettings});
		}
	});
	
	//Handle the discord.active checkbox manually as it has some specificities.
	$( "#" + $.escapeSelector("discord.active")).prop( "checked", JSONGetPathValue(appSettings, "discord.active")).trigger('change');
	$("#" + $.escapeSelector("discord.active")).on( "change", async function() {
		if(!$(this).is(":checked")){
			//Anytime is allowed to deactivate the discord feature
			JSONUpdatePathValue(appSettings, "discord.active", false);
			await chrome.storage.local.set({"settings": appSettings});
		}else if($(this).is(":checked") && JSONGetPathValue(appSettings, "discord.guid") != null){
			//Only allowed to activate the discord feature IF the guid is set.
			//(Discord will be enabled by default when GUID is set)
			JSONUpdatePathValue(appSettings, "discord.active", true);
			await chrome.storage.local.set({"settings": appSettings});
		}
	} );
	
	
	$("#saveGUID").on("click", async function(){
		$("#saveGUID").prop("disabled", true);
		
		//Post a fetch request to the Brenda API from the AmazonVine Discord server
		//We want to check if the guid is valid.
		let url = "https://api.llamastories.com/brenda/user/" + $("#" + $.escapeSelector("discord.guid")).val();
		const response = await fetch(url, {method: "GET"});
		if(response.status == 200){
			appSettings.discord.active = true;
			appSettings.discord.guid = $("#" + $.escapeSelector("discord.guid")).val();
			await chrome.storage.local.set({"settings": appSettings});
			$("#guid-txt").text(appSettings.discord.guid);
			$("#discord-guid-link").hide();
			$("#discord-guid-unlink").show();
		}else{
			$("#" + $.escapeSelector("discord.guid")).val("<invalid API Tokens>");
		}
		$("#saveGUID").prop("disabled", false);
	});
	$("#unlinkGUID").on("click", async function(){
		appSettings.discord.active = false;
		appSettings.discord.guid = null;
		await chrome.storage.local.set({"settings": appSettings});
		
		$("#"+ $.escapeSelector("discord.active")).prop("checked", false).trigger("change");
		$("#discord-guid-link").show();
		$("#discord-guid-unlink").hide();
	});
	
	


	function manageCheckboxSetting(key){
		let val = JSONGetPathValue(appSettings, key);
		if(val == true){
			$( "#" + $.escapeSelector(key)).prop( "checked", true).trigger('change');
		}else{
			$( "#" + $.escapeSelector(key)).prop( "checked", false).trigger('change');
		}

		$("#" + $.escapeSelector(key)).on( "change", async function() {
			JSONUpdatePathValue(appSettings, key, $(this).is(":checked"));
			await chrome.storage.local.set({"settings": appSettings});
		} );
	}



	
	manageCheckboxSetting("general.autofixInfiniteWheel");
	manageCheckboxSetting("general.topPagination");
	manageCheckboxSetting("hiddenTab.active");
	//manageCheckboxSetting("discord.active"); //Handled manually
	manageCheckboxSetting("unavailableTab.active");
	manageCheckboxSetting("unavailableTab.selfDiscard");
	manageCheckboxSetting("unavailableTab.compactToolbar");
	manageCheckboxSetting("unavailableTab.consensusDiscard");

	manageCheckboxSetting("thorvarium.smallItems");
	manageCheckboxSetting("thorvarium.removeHeader");
	manageCheckboxSetting("thorvarium.removeFooter");
	manageCheckboxSetting("thorvarium.removeAssociateHeader");
	manageCheckboxSetting("thorvarium.moreDescriptionText");
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

function JSONPathToObject(path, value){
	const arrPathLvl = path.split(".");
	var jsonObj = "";
	var jsonEnd = ""
	for(let i=0; i<arrPathLvl.length; i++){
		jsonObj = jsonObj + "{\"" + arrPathLvl[i] + "\":";
		jsonEnd = "}" + jsonEnd;
	}
	return JSON.parse(jsonObj + value + jsonEnd);
}

function JSONUpdatePathValue(obj, path, value){
	let newData = JSONPathToObject(path, value);
	$.extend(true, obj, newData);
}

function JSONGetPathValue(obj, path){
	try {
		let val = path.split(".").reduce((c, s) => c[s], obj);
		if (val == undefined)
			return null;
		else
			return val;
	}catch(error){
		return null;
	}
}


$('a.tips').each(function () {
	$( this ).tooltip({tooltipClass:'ui-tooltip'});
});

