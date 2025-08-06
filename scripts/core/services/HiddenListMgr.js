/*global chrome*/

import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
const Settings = new SettingsMgr();

import { ScreenNotifier, ScreenNotification } from "/scripts/ui/components/ScreenNotifier.js";
var Notifications = new ScreenNotifier();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
const i13n = new Internationalization();

import { Environment } from "/scripts/core/services/Environment.js";
var env = new Environment();

import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

class HiddenListMgr {
	static #instance = null;
	listLoaded;

	constructor() {
		if (HiddenListMgr.#instance) {
			// Return the existing instance if it already exists
			return HiddenListMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		HiddenListMgr.#instance = this;

		this.mapHidden = new Map();
		this.arrChanges = [];
		this.listLoaded = false;
		this.broadcast = new BroadcastChannel("VineHelper");

		logger.add("HIDDENMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.addEventListener("message", (ev) => {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "hideItem") {
				logger.add("Broadcast received: hide item " + ev.data.asin);
				this.addItem(ev.data.asin, false, false);
			}
			if (ev.data.type == "showItem") {
				logger.add("Broadcast received: show item " + ev.data.asin);
				this.removeItem(ev.data.asin, false, false);
			}
		});
	}

	async loadFromLocalStorage() {
		const data = await chrome.storage.local.get("hiddenItems");

		if (data.hiddenItems) {
			try {
				// Try parsing the stored string as JSON
				if (typeof data.hiddenItems === "string") {
					this.mapHidden = this.deserialize(data.hiddenItems);
				} else {
					this.mapHidden = new Map(Object.entries(data.hiddenItems));
				}
			} catch (error) {
				// If JSON parsing fails assume legacy format and convert to new format
				// Once the migration period is over delete this section of code
				logger.add("Failed to parse hiddenItems as JSON, treating as array:");
				if (Array.isArray(data.hiddenItems)) {
					this.mapHidden = data.hiddenItems.reduce((map, product) => {
						map.set(product.asin, new Date(product.date));
						return map;
					}, new Map());
				} else {
					logger.add("Invalid data format for hidden items.  Creating new map.");
					this.mapHidden = new Map(); // Initialize with an empty map if data is malformed
				}
			}
		} else {
			// No data found or empty hiddenItems, initialize an empty Map
			this.mapHidden = new Map();
		}
		this.listLoaded = true;
		logger.add("HIDDENMGR: List loaded.");
	}

	async removeItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapHidden.delete(asin);

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: false });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "showItem", asin: asin });
		}
	}

	async addItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		if (!(await this.isHidden(asin))) this.mapHidden.set(asin, Date.now());

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: true });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "hideItem", asin: asin });
		}
	}

	async saveList(remoteSave = true) {
		let storableVal = Object.fromEntries(this.mapHidden);
		//Send instructions to the service worker to save the list to local storage
		chrome.runtime.sendMessage({ type: "saveToLocalStorage", key: "hiddenItems", value: storableVal });

		//Save the list to local storage
		/*
		await chrome.storage.local.set({ hiddenItems: storableVal }, () => {
			if (chrome.runtime.lastError) {
				const error = chrome.runtime.lastError;
				if (error.message === "QUOTA_BYTES quota exceeded") {
					alert(`Vine Helper local storage quota exceeded! Hidden items will be trimmed to make space.`);
					this.garbageCollection();
				} else {
					alert(
						`Vine Helper encountered an error while trying to save your hidden items. Please report the following details: ${e.name}, ${e.message}`
					);
					return;
				}
			}
		});
		*/
		if (remoteSave && Settings.get("hiddenTab.remote")) {
			await this.notifyServerOfHiddenItem();
			this.arrChanges = [];
		}
	}

	async isHidden(asin) {
		while (!this.listLoaded) {
			await new Promise((r) => setTimeout(r, 50));
		}

		if (asin == undefined) {
			throw new Error("Asin not defined");
		}
		return this.mapHidden.has(asin);
	}

	isChange(asin) {
		for (const id in this.arrChanges) {
			if (this.arrChanges[id].asin == asin) {
				return id;
			}
		}
		return false;
	}

	updateArrChange(obj) {
		let itemId = this.isChange(obj.asin);
		if (itemId == false) this.arrChanges.push(obj);
		else this.arrChanges[itemId] = obj;
	}

	/**
	 * Send new items on the server to be added or removed from the hidden list.
	 */
	async notifyServerOfHiddenItem() {
		logger.add("Saving hidden item(s) remotely...");

		const content = {
			api_version: 5,
			app_version: env.data.appVersion,
			country: i13n.getCountryCode(),
			action: "save_hidden_list",
			uuid: Settings.get("general.uuid", false),
			items: this.arrChanges,
		};
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();

		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(env.getAPIUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		});
	}

	async garbageCollection() {
		if (!this.mapHidden) {
			return false;
		}

		let storageMaxSize = Settings.get("general.hiddenItemsCacheSize");
		if (isNaN(storageMaxSize)) {
			return false;
		}
		if (storageMaxSize < 1 || storageMaxSize > 9) {
			return false;
		}

		//Safari has a lower storage limit (5MB), so we need to reduce the size of the cache.
		if (storageMaxSize > 4 && env.isSafari()) {
			storageMaxSize = 4;
			Settings.set("general.hiddenItemsCacheSize", storageMaxSize);
		}

		//Delete items older than 90 days
		let needsSave = false;
		let timestampNow = Math.floor(Date.now() / 1000);
		if (Settings.get("hiddenTab.lastGC") == undefined) {
			Settings.set("hiddenTab.lastGC", timestampNow);
		}

		if (Settings.get("hiddenTab.lastGC") < timestampNow - 24 * 60 * 60) {
			let expiredDate = Date.now() - 90 * 24 * 60 * 60 * 1000;

			for (const [asin, date] of this.mapHidden.entries()) {
				if (date < expiredDate) {
					//expired, delete entry
					this.mapHidden.delete(asin);
					needsSave = true;
				}
			}

			Settings.set("hiddenTab.lastGC", timestampNow);
		}
		if (needsSave) {
			await this.saveList();
		}

		//Delete older items if the storage space is exceeded.
		let bytes = await getStorageSizeFull();
		const storageLimit = storageMaxSize * 1024 * 1024; // 9MB
		const reduction = storageMaxSize > 1 ? 1 : 0.5; //If max is 1, only clear 0.5mb
		const deletionThreshold = (storageMaxSize - reduction) * 1048576; // 8MB
		if (bytes > storageLimit) {
			let itemDeleted = 0;
			let note = new ScreenNotification();
			note.title = "Local storage quota exceeded!";
			note.lifespan = 60;
			note.content = `You've hidden so many items that your quota in the local storage has exceeded ${bytesToSize(
				storageLimit
			)}. To prevent issues, ~${reduction}MB of the oldest items are being deleted...`;
			await Notifications.pushNotification(note);

			//Give some breathing room for the notification to be displayed.
			await new Promise((r) => setTimeout(r, 500));

			// Convert the map into an array of [key, value] pairs
			let arrHidden = Array.from(this.mapHidden.entries());

			// Sort the array based on the date values (oldest first)
			arrHidden.sort((a, b) => a[1] - b[1]);

			while (bytes > deletionThreshold && arrHidden.length > 0) {
				let itemCount = arrHidden.length;
				//Delete 1000 items at the time
				let batchSize = 1000;
				let maxIndexThisBatch = batchSize + itemDeleted;
				//never go beyond the array size
				let stopAt = Math.min(maxIndexThisBatch, itemCount);

				for (let i = itemDeleted; i < stopAt; i++) {
					//find the asin from the sorted list and delete it from the map
					this.mapHidden.delete(arrHidden[i][0]);
					itemDeleted++;
				}

				await this.saveList(false);
				bytes = await getStorageSizeFull();
			}

			note.title = "Local storage quota fixed!";
			note.lifespan = 60;
			note.content = `GC done, ${itemDeleted} items have been deleted. Some of these items may re-appear in your listing.`;
			await Notifications.pushNotification(note);
		}
	}

	deserialize(jsonString) {
		//multiply by 1000 to convert from unix timestamp to js Date
		const retrievedObj = JSON.parse(jsonString);
		return new Map(Object.entries(retrievedObj).map(([key, value]) => [key, value]));
	}
}

function getStorageSizeFull() {
	return new Promise((resolve, reject) => {
		try {
			chrome.storage.local.getBytesInUse(null, function (bytes) {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve(bytes);
				}
			});
		} catch (e) {
			// Firefox doesn't support getBytesInUse, estimate size instead
			try {
				// Get the current hidden items data
				chrome.storage.local.get("hiddenItems", function (data) {
					if (chrome.runtime.lastError) {
						reject(new Error(chrome.runtime.lastError.message));
					} else {
						// Estimate size by getting the length of the serialized data
						// Each character in a string is typically 2 bytes in JavaScript
						const estimatedSize = data.hiddenItems ? data.hiddenItems.length * 2 : 0;
						resolve(estimatedSize);
					}
				});
			} catch (e2) {
				// If we can't even get the data, return 0
				resolve(0);
			}
		}
	});
}

function bytesToSize(bytes, decimals = 2) {
	if (!Number(bytes)) {
		return "0 Bytes";
	}

	const kbToBytes = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

	const index = Math.floor(Math.log(bytes) / Math.log(kbToBytes));

	return `${parseFloat((bytes / Math.pow(kbToBytes, index)).toFixed(dm))} ${sizes[index]}`;
}

export { HiddenListMgr };
