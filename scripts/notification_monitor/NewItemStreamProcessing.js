/*global chrome*/

import { Streamy } from "../Streamy.js";
import { SettingsMgr } from "../SettingsMgrCompat.js";
import { keywordMatch } from "../keywordMatch.js";
import { Item } from "../Item.js";
var Settings = new SettingsMgr();
var outputFunctions = {
	broadcast: () => {},
	push: () => {},
};

const dataStream = new Streamy();
const filterHideitem = dataStream.filter(function (data) {
	if (
		data.item?.data?.title === undefined ||
		data.item?.data?.etv_min === undefined ||
		data.item?.data?.etv_max === undefined
	) {
		return true; //Skip this filter
	}
	if (Settings.get("notification.hideList")) {
		const hideKWMatch = keywordMatch(
			Settings.get("general.hideKeywords"),
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
});
const transformIsHighlight = dataStream.transformer(function (data) {
	if (
		data.item?.data?.title === undefined ||
		data.item?.data?.etv_min === undefined ||
		data.item?.data?.etv_max === undefined
	) {
		return data; //Skip this transformer
	}
	const highlightKWMatch = keywordMatch(
		Settings.get("general.highlightKeywords"),
		data.item.data.title,
		data.item.data.etv_min,
		data.item.data.etv_max
	);
	data.item.data.KWsMatch = highlightKWMatch !== false;
	data.item.data.KW = highlightKWMatch;

	return data;
});
const transformIsBlur = dataStream.transformer(function (data) {
	if (data.item?.data?.title == undefined) {
		return data; //Skip this transformer
	}
	const blurKWMatch = keywordMatch(Settings.get("general.blurKeywords"), data.item.data.title);
	data.item.data.BlurKWsMatch = blurKWMatch !== false;
	data.item.data.BlurKW = blurKWMatch;

	return data;
});
const transformSearchPhrase = dataStream.transformer(function (data) {
	if (data.item?.data?.title == undefined) {
		return data; //Skip this transformer
	}

	//Method no longer useful.
	const search = data.item.data.title.replace(/^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/, "$1");
	data.item.data.search = search;
	return data;
});
const transformUnixTimestamp = dataStream.transformer(function (data) {
	if (data.item?.data?.date == undefined) {
		return data; //Skip this transformer
	}
	data.item.data.timestamp = dateToUnixTimestamp(data.item.data.date);
	return data;
});
const transformPostNotification = dataStream.transformer(function (data) {
	if (data.item?.data?.asin == undefined) {
		return data; //Skip this transformer
	}

	//If the new item match a highlight keyword, push a real notification.
	const KWNotification = Settings.get("notification.pushNotifications") && data.item.data.KWsMatch;
	const AFANotification = Settings.get("notification.pushNotificationsAFA") && data.item.data.queue == "last_chance";
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
});
dataStream
	.pipe(filterHideitem)
	.pipe(transformIsHighlight)
	.pipe(transformIsBlur)
	.pipe(transformSearchPhrase)
	.pipe(transformUnixTimestamp)
	.pipe(transformPostNotification)
	.output((data) => {
		//Broadcast the notification
		outputFunctions.broadcast(data);
	});

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
