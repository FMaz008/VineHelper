/*global chrome*/

import { Streamy } from "/scripts/core/utils/Streamy.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
import { UnifiedTransformHandler } from "/scripts/notifications-monitor/stream/UnifiedTransformHandler.js";
var Settings = new SettingsMgr();

// Create unified transform handler
let transformHandler = null;

// Initialize transform handler when settings are loaded
Settings.waitForLoad().then(async () => {
	// Initialize the unified transform handler
	transformHandler = new UnifiedTransformHandler(Settings);
	// Keywords are now pre-compiled when saved in settings
});

// Listen for settings changes to update handler
if (typeof chrome !== "undefined" && chrome.storage) {
	chrome.storage.onChanged.addListener((changes, namespace) => {
		if (namespace === "local") {
			// Check if any relevant settings changed
			const relevantKeys = [
				"general.hideKeywords",
				"general.highlightKeywords",
				"general.blurKeywords",
				"notification.hideList",
				"notification.pushNotifications",
				"notification.pushNotificationsAFA",
			];

			if (relevantKeys.some((key) => changes[key])) {
				// Update the handler's cached settings
				if (transformHandler) {
					transformHandler.updateCachedSettings();
				}
				// Keywords are now pre-compiled when saved, no need to recompile here
			}
		}
	});
}
var outputFunctions = {
	broadcast: () => {},
	push: () => {},
};

// Wrapper functions for stream compatibility
function filterHandler(data) {
	return transformHandler ? transformHandler.filter(data) : true;
}

function transformHandlerWrapper(data) {
	return transformHandler ? transformHandler.transform(data) : data;
}

function outputHandler(data) {
	// Handle notification if present
	if (data.notification) {
		outputFunctions.push(data.notification.title, data.notification.item);
	}
	// Broadcast the notification
	outputFunctions.broadcast(data);
}

const dataStream = new Streamy();
//ALL the Transformers needs to run before the filter
//because it will generate the highlight match, which the filter for hide keywords needs to use
const transformStream = dataStream.transformer(transformHandlerWrapper);
const filterStream = dataStream.filter(filterHandler);

// Use single pipeline instead of multiple transforms
dataStream.pipe(filterStream).pipe(transformStream).output(outputHandler);

function broadcastFunction(fct) {
	outputFunctions.broadcast = fct;
}
function notificationPushFunction(fct) {
	outputFunctions.push = fct;
}
export { dataStream, broadcastFunction, notificationPushFunction };
