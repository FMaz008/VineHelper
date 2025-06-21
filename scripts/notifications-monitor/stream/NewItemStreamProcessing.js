/*global chrome*/

import { Streamy } from "/scripts/core/utils/Streamy.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
import { keywordMatch } from "/scripts/core/utils/KeywordMatch.js";
import { precompileAllKeywords } from "/scripts/core/utils/KeywordPrecompiler.js";
import { Item } from "/scripts/core/models/Item.js";
var Settings = new SettingsMgr();

// Cache keywords and settings to avoid repeated Settings.get() calls
let cachedHideKeywords = null;
let cachedHighlightKeywords = null;
let cachedBlurKeywords = null;
let cachedHideListEnabled = false;
let cachedPushNotifications = false;
let cachedPushNotificationsAFA = false;

// Pre-compile regex for search phrase extraction
const SEARCH_PHRASE_REGEX = /^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/;

// Pre-compile keywords when settings are loaded
Settings.waitForLoad().then(() => {
	// Cache the keywords arrays
	cachedHideKeywords = Settings.get("general.hideKeywords");
	cachedHighlightKeywords = Settings.get("general.highlightKeywords");
	cachedBlurKeywords = Settings.get("general.blurKeywords");

	// Cache notification settings
	cachedHideListEnabled = Settings.get("notification.hideList");
	cachedPushNotifications = Settings.get("notification.pushNotifications");
	cachedPushNotificationsAFA = Settings.get("notification.pushNotificationsAFA");

	// Pre-compile with cached arrays
	precompileAllKeywords(Settings, "NewItemStreamProcessing");
});

// Listen for settings changes to update cache
if (typeof chrome !== "undefined" && chrome.storage) {
	chrome.storage.onChanged.addListener((changes, namespace) => {
		if (namespace === "local") {
			if (changes["general.hideKeywords"]) {
				cachedHideKeywords = changes["general.hideKeywords"].newValue;
			}
			if (changes["general.highlightKeywords"]) {
				cachedHighlightKeywords = changes["general.highlightKeywords"].newValue;
			}
			if (changes["general.blurKeywords"]) {
				cachedBlurKeywords = changes["general.blurKeywords"].newValue;
			}
			if (changes["notification.hideList"]) {
				cachedHideListEnabled = changes["notification.hideList"].newValue;
			}
			if (changes["notification.pushNotifications"]) {
				cachedPushNotifications = changes["notification.pushNotifications"].newValue;
			}
			if (changes["notification.pushNotificationsAFA"]) {
				cachedPushNotificationsAFA = changes["notification.pushNotificationsAFA"].newValue;
			}
		}
	});
}
var outputFunctions = {
	broadcast: () => {},
	push: () => {},
};

// Helper function to check if item has required ETV data
function hasRequiredEtvData(data) {
	return (
		data.item?.data?.title !== undefined &&
		data.item?.data?.etv_min !== undefined &&
		data.item?.data?.etv_max !== undefined
	);
}

// Helper function to check if item has title
function hasTitle(data) {
	return data.item?.data?.title !== undefined;
}

// Pre-define transformer functions to avoid repeated allocations
function filterHideItemHandler(data) {
	if (!hasRequiredEtvData(data)) {
		return true; //Skip this filter
	}
	if (cachedHideListEnabled && cachedHideKeywords) {
		const hideKWMatch = keywordMatch(
			cachedHideKeywords,
			data.item.data.title,
			data.item.data.etv_min,
			data.item.data.etv_max
		);
		if (hideKWMatch !== false) {
			//console.log("Item " + data.title + " matched hide keyword " + hideKWMatch + " hide it.");
			return false; //Do not display the notification as it matches the hide list.
		}
	}
	return true;
}

function transformIsHighlightHandler(data) {
	if (!hasRequiredEtvData(data)) {
		return data; //Skip this transformer
	}
	const highlightKWMatch = cachedHighlightKeywords
		? keywordMatch(cachedHighlightKeywords, data.item.data.title, data.item.data.etv_min, data.item.data.etv_max)
		: false;
	data.item.data.KWsMatch = highlightKWMatch !== false;
	data.item.data.KW = highlightKWMatch;

	return data;
}

function transformIsBlurHandler(data) {
	if (!hasTitle(data)) {
		return data; //Skip this transformer
	}
	const blurKWMatch = cachedBlurKeywords ? keywordMatch(cachedBlurKeywords, data.item.data.title) : false;
	data.item.data.BlurKWsMatch = blurKWMatch !== false;
	data.item.data.BlurKW = blurKWMatch;

	return data;
}

function transformSearchPhraseHandler(data) {
	if (!hasTitle(data)) {
		return data; //Skip this transformer
	}

	// Extract first 40 characters as search phrase
	const match = data.item.data.title.match(SEARCH_PHRASE_REGEX);
	data.item.data.search = match ? match[1] : data.item.data.title.substring(0, 40);
	return data;
}

function transformUnixTimestampHandler(data) {
	if (data.item?.data?.date === undefined) {
		return data; //Skip this transformer
	}
	data.item.data.timestamp = dateToUnixTimestamp(data.item.data.date);
	return data;
}

function transformPostNotificationHandler(data) {
	if (data.item?.data?.asin === undefined) {
		return data; //Skip this transformer
	}

	//If the new item match a highlight keyword, push a real notification.
	const KWNotification = cachedPushNotifications && data.item.data.KWsMatch;
	const AFANotification = cachedPushNotificationsAFA && data.item.data.queue === "last_chance";
	if (KWNotification || AFANotification) {
		//Create a new clean item with just the info needed to display the notification
		const item = new Item({
			asin: data.item.data.asin,
			queue: data.item.data.queue,
			is_parent_asin: data.item.data.is_parent_asin,
			is_pre_release: data.item.data.is_pre_release,
			enrollment_guid: data.item.data.enrollment_guid,
		});
		item.setTitle(data.item.data.title);
		item.setImgUrl(data.item.data.img_url);
		item.setSearch(data.item.data.search);

		if (KWNotification) {
			outputFunctions.push("Vine Helper - New item match KW!", item);
		} else if (AFANotification) {
			outputFunctions.push("Vine Helper - New AFA item", item);
		}
	}
	return data;
}

function outputHandler(data) {
	//Broadcast the notification
	outputFunctions.broadcast(data);
}

const dataStream = new Streamy();
const filterHideitem = dataStream.filter(filterHideItemHandler);
const transformIsHighlight = dataStream.transformer(transformIsHighlightHandler);
const transformIsBlur = dataStream.transformer(transformIsBlurHandler);
const transformSearchPhrase = dataStream.transformer(transformSearchPhraseHandler);
const transformUnixTimestamp = dataStream.transformer(transformUnixTimestampHandler);
const transformPostNotification = dataStream.transformer(transformPostNotificationHandler);
dataStream
	.pipe(filterHideitem)
	.pipe(transformIsHighlight)
	.pipe(transformIsBlur)
	.pipe(transformSearchPhrase)
	.pipe(transformUnixTimestamp)
	.pipe(transformPostNotification)
	.output(outputHandler);

function dateToUnixTimestamp(dateString) {
	const date = new Date(dateString + " UTC");

	// Get the Unix timestamp in seconds
	return Math.floor(date.getTime() / 1000);
}

function broadcastFunction(fct) {
	outputFunctions.broadcast = fct;
}
function notificationPushFunction(fct) {
	outputFunctions.push = fct;
}
export { dataStream, broadcastFunction, notificationPushFunction };
