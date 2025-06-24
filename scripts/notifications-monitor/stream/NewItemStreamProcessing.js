/*global chrome*/

import { Streamy } from "/scripts/core/utils/Streamy.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
import { UnifiedTransformHandler } from "/scripts/notifications-monitor/stream/UnifiedTransformHandler.js";
var Settings = new SettingsMgr();

// Track recent OS notifications to prevent duplicates
const recentOSNotifications = new Map();
const OS_NOTIFICATION_DEDUP_WINDOW = 2000; // 2 seconds

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
	const debugNotifications = Settings.get("general.debugNotifications");
	const asin = data.notification?.item?.getAsin?.() || data.notification?.item?.asin || data.asin;

	// Track specific item processing for debugging if needed
	if (debugNotifications && asin === "B0F32SHGNR") {
		console.log("[NewItemStreamProcessing] Processing specific item", {
			asin,
			hasNotification: !!data.notification,
			dataKeys: Object.keys(data),
			timestamp: Date.now(),
			stackTrace: new Error().stack,
		});
	}

	// Handle notification if present
	if (data.notification) {
		const asin = data.notification.item?.getAsin?.() || data.notification.item?.asin;
		const now = Date.now();

		// Check for duplicate OS notifications
		const lastNotificationTime = recentOSNotifications.get(asin);
		const isDuplicate = lastNotificationTime && now - lastNotificationTime < OS_NOTIFICATION_DEDUP_WINDOW;

		if (debugNotifications) {
			console.log("[NewItemStreamProcessing] OS notification check:", {
				title: data.notification.title,
				asin: asin,
				hasOutputFunction: !!outputFunctions.push,
				timestamp: now,
				isDuplicate: isDuplicate,
				timeSinceLastNotification: lastNotificationTime ? now - lastNotificationTime : null,
			});
		}

		if (!isDuplicate) {
			// Record this notification
			recentOSNotifications.set(asin, now);

			// Clean up old entries (older than 10 seconds)
			for (const [key, timestamp] of recentOSNotifications) {
				if (now - timestamp > 10000) {
					recentOSNotifications.delete(key);
				}
			}

			// Send the OS notification
			outputFunctions.push(data.notification.title, data.notification.item);
		} else if (debugNotifications) {
			console.warn("[NewItemStreamProcessing] Skipping duplicate OS notification for ASIN:", asin);
		}
	}

	// Broadcast the notification
	outputFunctions.broadcast(data);
}

const dataStream = new Streamy();
const filterStream = dataStream.filter(filterHandler);
const transformStream = dataStream.transformer(transformHandlerWrapper);

// Use single pipeline instead of multiple transforms
dataStream.pipe(filterStream).pipe(transformStream).output(outputHandler);

function broadcastFunction(fct) {
	outputFunctions.broadcast = fct;
}
function notificationPushFunction(fct) {
	outputFunctions.push = fct;
}
export { dataStream, broadcastFunction, notificationPushFunction };
