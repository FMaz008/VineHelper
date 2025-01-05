import { Streamy } from "../Streamy.js";
import { SettingsMgr } from "../SettingsMgr.js";
import { keywordMatch } from "./keywordMatch.js";

var Settings = new SettingsMgr();
var outputFunctions = {
	broadcast: () => {},
	push: () => {},
};

const dataStream = new Streamy();
const filterHideitem = dataStream.filter(function (data) {
	if (Settings.get("notification.hideList")) {
		const hideKWMatch = keywordMatch(Settings.get("general.hideKeywords"), data.title, data.etv_min, data.etv_max);
		if (hideKWMatch !== false) {
			//console.log("Item " + data.title + " matched hide keyword " + hideKWMatch + " hide it.");
			return false; //Do not display the notification as it matches the hide list.
		}
	}
	return true;
});
const transformIsHighlight = dataStream.transformer(function (data) {
	const highlightKWMatch = keywordMatch(
		Settings.get("general.highlightKeywords"),
		data.title,
		data.etv_min,
		data.etv_max
	);
	data.KWsMatch = highlightKWMatch !== false;
	data.KW = highlightKWMatch;

	return data;
});
const transformIsBlur = dataStream.transformer(function (data) {
	const blurKWMatch = keywordMatch(Settings.get("general.blurKeywords"), data.title);
	data.BlurKWsMatch = blurKWMatch !== false;
	data.BlurKW = blurKWMatch;

	return data;
});
const transformSearchPhrase = dataStream.transformer(function (data) {
	//Method no longer useful.
	const search = data.title.replace(/^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/, "$1");
	data.search = search;
	return data;
});
const transformUnixTimestamp = dataStream.transformer(function (data) {
	data.timestamp = dateToUnixTimestamp(data.date);
	return data;
});
const transformPostNotification = dataStream.transformer(function (data) {
	//If the new item match a highlight keyword, push a real notification.
	if (Settings.get("notification.pushNotifications") && data.KWsMatch) {
		outputFunctions.push(
			data.asin,
			data.queue,
			data.is_parent_asin,
			data.enrollment_guid,
			data.search,
			"Vine Helper - New item match KW!",
			data.title,
			data.img_url
		);
	}
	//If the new item match in AFA queue, push a real notification.
	else if (Settings.get("notification.pushNotificationsAFA") && data.queue == "last_chance") {
		outputFunctions.push(
			data.asin,
			data.queue,
			data.is_parent_asin,
			data.enrollment_guid,
			data.search,
			"Vine Helper - New AFA item",
			data.title,
			data.img_url
		);
	}
	return data;
});
const transformExecuteHooks = dataStream.transformer(function (data) {
	let data2 = { ...data };

	if (data.KWsMatch) {
		data2.type = "hookExecute";
		data2.hookname = "newItemKWMatch";
		outputFunctions.broadcast(data2, "newItemKWMatch");
	} else {
		data2.type = "hookExecute";
		data2.hookname = "newItemNoKWMatch";
		outputFunctions.broadcast(data2, "newItemNoKWMatch");
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
	.pipe(transformExecuteHooks)
	.output((data) => {
		//Broadcast the notification
		outputFunctions.broadcast(data, "notification");
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
