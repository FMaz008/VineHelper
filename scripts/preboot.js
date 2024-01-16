const startTime = Date.now();

//Extension settings
var appSettings = {};

var vineDomain = null;
var vineQueue = null


//#########################
//### Load settings

async function getLocalStorageVariable(varName){
	let result = await chrome.storage.local.get(varName);
	if(!$.isEmptyObject(result))
		return null;
	return result[varName];
}
//This method will initiate the settings for the first time,
//and will convert the old style of settings (<=V1.9) to the new JSON style.
async function convertOldSettingsToNewJSONFormat(){
	
	//Default values (useful if this is the first time running the extension)
	let consensusThreshold = 2;
	let consensusDiscard= true;
	let unavailableOpacity = 100;
	let selfDiscard = false;
	let topPagination = false;
	let unavailableTab = true;
	let hiddenTab = true;
	let compactToolbar = false;
	let autofixInfiniteWheel = true;


	//Load settings from <=V1.9, if they exist.
	result = await getLocalStorageVariable("settingsThreshold");
	if(result > 0 && result <10)
		consensusThreshold = result;
	
	result = await getLocalStorageVariable("settingsUnavailableOpacity");
	if(result > 0 && result <=100)
		unavailableOpacity = result;
	
	result = await getLocalStorageVariable("settingsSelfDiscard");
	if(result == true || result == false)
		selfDiscard = result;
	
	result = await getLocalStorageVariable("settingsConsensusDiscard");
	if(result == true || result == false)
		consensusDiscard = result;
	
	result = await getLocalStorageVariable("settingsCompactToolbar");
	if(result == true || result == false)
		compactToolbar = result;
	
	result = await getLocalStorageVariable("settingsTopPagination");
	if(result == true || result == false)
		topPagination = result;
	
	result = await getLocalStorageVariable("settingsAutofixInfiniteWheel");
	if(result == true || result == false)
		autofixInfiniteWheel = result;
	
	result = await getLocalStorageVariable("settingsUnavailableTab");
	if(result == true || result == false)
		unavailableTab = result;

	result = await getLocalStorageVariable("settingsHiddenTab");
	if(result == true || result == false)
		hiddenTab = result;
	
	
	//Craft the new settings in JSON
	settings = {
		"unavailableTab":{
			"active": unavailableTab,
			"consensusThreshold": consensusThreshold,
			"unavailableOpacity": unavailableOpacity,
			"selfDiscard": selfDiscard,
			"consensusDiscard": consensusDiscard,
			"compactToolbar": compactToolbar
		},
		
		"general":{
			"topPagination": topPagination,
			"autofixInfiniteWheel": autofixInfiniteWheel,
			"versionInfoPopup": true,
			"firstVotePopup": true
		},
		
		"hiddenTab": {
			"active": hiddenTab,
			"arrItems": []
		},
		
		"discord":{
			"active": false,
			"guid": null
		},
		
		"thorvarium": {
			"smallItems": await getLocalStorageVariable("thorvariumSmallItems") ? true: false,
			"removeHeader": await getLocalStorageVariable("thorvariumRemoveHeader") ? true: false,
			"removeFooter": await getLocalStorageVariable("thorvariumRemoveFooter") ? true: false,
			"removeAssociateHeader": await getLocalStorageVariable("thorvariumRemoveAssociateHeader") ? true: false,
			"moreDescriptionText": await getLocalStorageVariable("thorvariumMoreDescriptionText") ? true: false,
			"ETVModalOnTop": await getLocalStorageVariable("thorvariumETVModalOnTop") ? true: false,
			"categoriesWithEmojis": await getLocalStorageVariable("thorvariumCategoriesWithEmojis") ? true: false,
			"paginationOnTop": await getLocalStorageVariable("thorvariumPaginationOnTop") ? true: false,
			"collapsableCategories": await getLocalStorageVariable("thorvariumCollapsableCategories") ? true: false,
			"collapsableCategories": await getLocalStorageVariable("thorvariumCollapsableCategories") ? true: false,
			"stripedCategories": await getLocalStorageVariable("thorvariumStripedCategories") ? true: false,
			"limitedQuantityIcon": await getLocalStorageVariable("thorvariumLimitedQuantityIcon") ? true: false,
			"RFYAFAAITabs": await getLocalStorageVariable("thorvariumRFYAFAAITabs") ? true: false
		}
	}
	
	//Convert old hidden pageId to asin
	let arr = await getLocalStorageVariable("arrHidden");
	if(arr!= undefined)
		arr.forEach((element) => settings.hiddenTab.arrItems.push({"asin" : element["pageId"], "date": element["date"]}));
	
	//Delete the old settings
	await chrome.storage.local.clear();//Delete all local storage
	
	await chrome.storage.local.set({"settings": settings});
	return settings;
}

//Loading the settings from the local storage	
async function getSettings(){
	
	showRuntime("PRE: Reading settings from local storage");
	
	const data = await chrome.storage.local.get("settings");
	showRuntime("PRE: Done reading settings");
	
	//If no settings exist already, create the default ones
	if($.isEmptyObject(data)){
		console.log("Settings not found, generating default configuration...");
		//Load the old settings and convert them to the new format
		//Will generate default settings if no old settings were found.
		appSettings = await convertOldSettingsToNewJSONFormat();
	}else{
		Object.assign(appSettings, data.settings);
	}
	
	
	//Load the thorvarium styleSheets
	
	//Load Thorvarium stylesheets
	if(appSettings.thorvarium.smallItems)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/small-items.css">');
	
	if(appSettings.thorvarium.removeHeader)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-header.css">');
	
	if(appSettings.thorvarium.removeFooter)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-footer.css">');
	
	if(appSettings.thorvarium.removeAssociateHeader)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/remove-associate-header.css">');
	
	if(appSettings.thorvarium.moreDescriptionText)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/more-description-text.css">');
	
	if(appSettings.thorvarium.darktheme)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/dark-theme.css">');
	
	if(appSettings.thorvarium.ETVModalOnTop)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/etv-modal-on-top.css">');
	
	if(appSettings.thorvarium.categoriesWithEmojis)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/categories-with-emojis.css">');
	
	if(appSettings.thorvarium.paginationOnTop)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/pagination-on-top.css">');
	
	if(appSettings.thorvarium.collapsableCategories)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/collapsable-categories.css">');
	
	if(appSettings.thorvarium.stripedCategories)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/striped-categories.css">');
	
	if(appSettings.thorvarium.limitedQuantityIcon)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/limited-quantity-icon.css">');
	
	if(appSettings.thorvarium.RFYAFAAITabs)
		$('head').append('<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/Thorvarium/vine-styling/desktop/rfy-afa-ai-tabs.css">');
	
	showRuntime("BOOT: Thorvarium stylesheets injected");
	
	
	
	//Figure out what domain the extension is working on
	//De-activate the unavailableTab (and the voting system) for all non-.ca domains.
	let currentUrl = window.location.href; 
	regex = /^(?:.*:\/\/)(?:.+[\.]?)amazon\.(.+)\/vine\/.*$/;
	arrMatches = currentUrl.match(regex);
	vineDomain = arrMatches[1];
	
	//If the domain is not Canada, de-activate the voting system/unavailable tab
	if(vineDomain != "ca"){
		appSettings.unavailableTab.active = false;
		appSettings.unavailableTab.compactToolbar = true;
		appSettings.unavailableTab.consensusDiscard = false;
		appSettings.unavailableTab.selfDiscard = false;
	}
	
	//If the domain if not from outside the countries supported by the discord API, disable discord
	if (["ca", "com", "co.uk"].indexOf(vineDomain) == -1){
		appSettings.discord.active = false;
	}
	
	
	//Determine if we are browsing a queue
	regex = /^(?:.*:\/\/)(?:.+[\.]?)amazon\..+\/vine\/vine-items(?:\?queue=(.+?))?(?:#.*)?$/;
	arrMatches = currentUrl.match(regex);
	vineQueue = null;
	if(arrMatches != null){
		if(arrMatches[1] == undefined){
			vineQueue = "last_chance";
		} else{
			vineQueue = arrMatches[1];
		}
	}
	
	
	showRuntime("PRE: Settings loaded");
	
	discardedItemGarbageCollection();
	
	showRuntime("PRE: Garbage collection completed.");
}
showRuntime("PRE: Begining to load settings");
getSettings(); //First call to launch the extension.


function discardedItemGarbageCollection(){
	var change = false;
	let expiredDate = new Date();
	expiredDate.setDate(expiredDate.getDate() - 90);
	
	//Not sure why this occurs sometimes, but here's an easy fix
	if(appSettings.hiddenTab.arrHidden == undefined){
		appSettings.hiddenTab.arrHidden = [];
		change=true;
	}	

	//Splicing inside a foreach might skip the item following the deleted one, 
	//but this method is called on every page load so it is effectively inconsequential asin
	//the missing items will be caught on the next pass.
	$.each(appSettings.hiddenTab.arrItems, function(key, value){
		if(key!=undefined && value["date"] < expiredDate){
			appSettings.hiddenTab.arrItems.splice(key, 1);
			change = true;
		}
	});
	
	//Save array to local storage
	if(change){
		chrome.storage.local.set({ "settings": appSettings }); //Save the settings
	}
}

function showRuntime(eventName){
	//console.log(eventName+": "+ (Date.now() - startTime) + "ms");
}

function saveSettings(){
	chrome.storage.local.set({ 'settings': appSettings });
}





