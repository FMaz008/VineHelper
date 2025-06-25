/*global chrome*/

import { Streamy } from "/scripts/core/utils/Streamy.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
import { UnifiedTransformHandler } from "/scripts/notifications-monitor/stream/UnifiedTransformHandler.js";
import { Item } from "/scripts/core/models/Item.js";
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
	// Debug log to see what data we're getting
	if (Settings.get("general.debugNotifications") && data && data.type === "newItem") {
		console.log("[NewItemStreamProcessing] filterHandler input:", {
			type: data.type,
			hasItem: !!data.item,
			itemType: typeof data.item,
			isItemInstance: data.item instanceof Item,
			hasData: data.item && !!data.item.data,
			dataKeys: data.item && data.item.data ? Object.keys(data.item.data) : []
		});
	}
	
	// Only filter out newItem messages that don't have item data
	// Let other message types (like fetchRecentItemsEnd) pass through
	if (data && data.type === "newItem" && !data.item) {
		if (Settings.get("general.debugNotifications")) {
			console.warn("[NewItemStreamProcessing] Filtering out empty newItem in filterHandler");
		}
		return false;
	}
	return transformHandler ? transformHandler.filter(data) : true;
}

function transformHandlerWrapper(data) {
	if (Settings.get("general.debugNotifications") && data && data.type === "newItem") {
		console.log("[NewItemStreamProcessing] transformHandlerWrapper input:", {
			type: data.type,
			hasItem: !!data.item,
			itemType: typeof data.item,
			isItemInstance: data.item instanceof Item,
			hasData: data.item && !!data.item.data,
			asin: data.item && data.item.data && data.item.data.asin
		});
	}
	
	const result = transformHandler ? transformHandler.transform(data) : data;
	
	if (Settings.get("general.debugNotifications") && result && result.type === "newItem") {
		console.log("[NewItemStreamProcessing] transformHandlerWrapper output:", {
			type: result.type,
			hasItem: !!result.item,
			itemType: typeof result.item,
			isItemInstance: result.item instanceof Item,
			hasData: result.item && !!result.item.data,
			asin: result.item && result.item.data && result.item.data.asin
		});
	}
	
	return result;
}

function outputHandler(data) {
	// Skip empty newItem objects that shouldn't have passed the filter
	if (data && data.type === "newItem" && !data.item) {
		if (Settings.get("general.debugNotifications")) {
			console.warn("[NewItemStreamProcessing] Skipping empty newItem object in outputHandler", {
				dataKeys: Object.keys(data),
				data: data
			});
		}
		return;
	}

	const debugNotifications = Settings.get("general.debugNotifications");
	// Fix: The item is at data.item, not data.notification.item
	let asin = data.item?.data?.asin || data.asin;

	// Enhanced debugging to understand data structure
	if (debugNotifications) {
		// Log empty objects to trace their origin
		if (!data || Object.keys(data).length === 0) {
			console.warn("[NewItemStreamProcessing] Empty data object received in outputHandler");
		} else if (data.item || data.type) {
			console.log("[NewItemStreamProcessing] outputHandler data structure:", {
				type: data.type,
				hasItem: !!data.item,
				itemType: typeof data.item,
				itemData: data.item?.data,
				itemDataAsin: data.item?.data?.asin,
				dataAsin: data.asin,
				extractedAsin: asin,
				dataKeys: Object.keys(data),
			});
		}
	}

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

	// Handle notification if present (for keyword matches and AFA items)
	if (data.notification) {
		// Fix: Access ASIN from Item instance's data property
		asin = data.notification.item?.data?.asin;
		
		// Skip processing if no ASIN is available
		if (!asin) {
			if (debugNotifications) {
				console.warn("[NewItemStreamProcessing] Skipping notification - no ASIN available:", {
					title: data.notification.title,
					itemData: data.notification.item?.data,
					hasItem: !!data.notification.item,
				});
			}
			// Don't process notifications without ASINs
			return;
		}
		
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

	// Only broadcast if we have valid item data
	// This prevents empty newItem messages from being sent to ServerCom
	if (data.item) {
		outputFunctions.broadcast(data);
	} else if (data.type !== "newItem") {
		// Allow non-newItem messages (like fetchRecentItemsEnd) to pass through
		outputFunctions.broadcast(data);
	} else if (debugNotifications) {
		console.warn("[NewItemStreamProcessing] Not broadcasting newItem without item data:", {
			type: data.type,
			hasItem: !!data.item,
			hasNotification: !!data.notification,
			dataKeys: Object.keys(data)
		});
	}
}

const dataStream = new Streamy();

// Add input handler to log what's coming into the stream
dataStream.input = (function(originalInput) {
	return function(data) {
		if (Settings.get("general.debugNotifications") && data.type === "newItem") {
			console.log("[NewItemStreamProcessing] Stream input:", {
				type: data.type,
				hasItem: !!data.item,
				itemType: typeof data.item,
				isItemInstance: data.item instanceof Item,
				itemKeys: data.item ? Object.keys(data.item) : [],
				dataKeys: Object.keys(data),
				// Log the actual data to see what we're getting
				actualData: data
			});
		}
		return originalInput.call(this, data);
	};
})(dataStream.input.bind(dataStream));

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
