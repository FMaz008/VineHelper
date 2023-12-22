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
	$("#confirmed").text(data["totalConfirmed"]);
	$("#discarded").text(data["totalDiscarded"]);
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
    $("#threshold").val(data.settingsThreshold);
});

$("#threshold").on( "change", function() {
	if(isNumeric($(this).val()) && $(this).val()>0 && $(this).val() <10){
		chrome.storage.local.set({ settingsThreshold: $( this ).val() });
	}
} );


chrome.storage.local.get('settingsSelfDiscard', function(data) {
	if(data && data.settingsSelfDiscard == true){
		$( "#selfDiscard" ).prop( "checked", true);
	}else{
		$( "#selfDiscard" ).prop( "checked", false);
	}
});

$("#selfDiscard").on( "change", function() {
	chrome.storage.local.set({ settingsSelfDiscard: $( this ).is(":checked") });
} );
