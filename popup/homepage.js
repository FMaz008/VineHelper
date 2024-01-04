//Reminder: This script is executed from the extension popup.
//          The console used is the browser console, not the inspector console.

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



function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}


//Load/save settings:

chrome.storage.local.get('settingsThreshold', function(data) {
	if(!data || !data.settingsThreshold || !isNumeric(data.settingsThreshold) || data.settingsThreshold < 1){
		data.settingsThreshold = 2;
	}
    $("#settingsThreshold").val(data.settingsThreshold);
});
$("#settingsThreshold").on( "change", function() {
	if(isNumeric($(this).val()) && $(this).val()>0 && $(this).val() <10){
		chrome.storage.local.set({ settingsThreshold: $( this ).val() });
	}
} );


chrome.storage.local.get('settingsUnavailableOpacity', function(data) {
	if(!data || !data.settingsUnavailableOpacity || !isNumeric(data.settingsUnavailableOpacity) || data.settingsUnavailableOpacity < 1){
		data.settingsUnavailableOpacity = 100;
	}
    $("#settingsUnavailableOpacity").val(data.settingsUnavailableOpacity);
});
$("#settingsUnavailableOpacity").on( "change", function() {
	if(isNumeric($(this).val()) && $(this).val()>0 && $(this).val() <=100){
		chrome.storage.local.set({ settingsUnavailableOpacity: $( this ).val() });
	}
} );




function manageCheckboxSetting(key, defaultvalue = false){
	var DV = defaultvalue;
	chrome.storage.local.get([key], function(data) {
		if(data && data[key] == true){
			$( "#" + key ).prop( "checked", true);
		}else if(data && data[key] == false){
			$( "#" + key ).prop( "checked", false);
		}else{
			$( "#" + key ).prop( "checked", DV);
		}
	});

	$("#" + key).on( "change", function() {
		chrome.storage.local.set({ [key]: $( this ).is(":checked") });
	} );
}

manageCheckboxSetting("settingsSelfDiscard");
manageCheckboxSetting("settingsCompactToolbar");
manageCheckboxSetting("settingsBottomPagination");
manageCheckboxSetting("settingsConsensusDiscard", true);
manageCheckboxSetting("settingsAutofixInfiniteWheel", true);

manageCheckboxSetting("thorvariumSmallItems");
manageCheckboxSetting("thorvariumRemoveHeader");
manageCheckboxSetting("thorvariumRemoveFooter");
manageCheckboxSetting("thorvariumRemoveAssociateHeader");
manageCheckboxSetting("thorvariumMoreDescriptionText");
manageCheckboxSetting("thorvariumETVModalOnTop");
manageCheckboxSetting("thorvariumCategoriesWithEmojis");
manageCheckboxSetting("thorvariumPaginationOnTop");
manageCheckboxSetting("thorvariumCollapsableCategories");
manageCheckboxSetting("thorvariumStripedCategories");
manageCheckboxSetting("thorvariumLimitedQuantityIcon");
manageCheckboxSetting("thorvariumRFYAFAAITabs");
		
		