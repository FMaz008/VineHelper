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


	//UI interaction
	$("#" + $.escapeSelector("unavailableTab.active")).on("change", function(){
		if($(this).prop( "checked"))
			$("#unavailableTabOptions").show();
		else
			$("#unavailableTabOptions").hide();
	});
	if(!appSettings.unavailableTab.active){
		$("#unavailableTabOptions").hide();
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



	manageCheckboxSetting("unavailableTab.selfDiscard");
	manageCheckboxSetting("unavailableTab.compactToolbar");
	manageCheckboxSetting("general.topPagination");
	manageCheckboxSetting("hiddenTab.active");
	manageCheckboxSetting("unavailableTab.consensusDiscard");
	manageCheckboxSetting("general.autofixInfiniteWheel");
	manageCheckboxSetting("unavailableTab.active");

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
	return path.split(".").reduce((c, s) => c[s], obj);
}

