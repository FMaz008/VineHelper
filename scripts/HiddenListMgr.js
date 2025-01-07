import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();

import { Internationalization } from "./Internationalization.js";
const i13n = new Internationalization();

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
		this.broadcast = new BroadcastChannel("vine_helper");

		logger.add("HIDDENMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.onmessage = (ev) => {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "hideItem") {
				logger.add("Broadcast received: hide item " + ev.data.asin);
				this.addItem(ev.data.asin, false, false);
			}
			if (ev.data.type == "showItem") {
				logger.add("Broadcast received: show item " + ev.data.asin);
				this.removeItem(ev.data.asin, false, false);
			}
		};
	}

	async loadFromLocalStorage() {
		const data = await chrome.storage.local.get("hiddenItems");

		if (data.hiddenItems) {
			try {
				// Try parsing the stored string as JSON
				this.mapHidden = this.deserialize(data.hiddenItems);
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

		if (!(await this.isHidden(asin))) this.mapHidden.set(asin, new Date());

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: true });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "hideItem", asin: asin });
		}
	}

	async saveList(remoteSave = true) {
		let storableVal = this.serialize(this.mapHidden);
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

		if (remoteSave && Settings.get("hiddenTab.remote")) {
			this.notifyServerOfHiddenItem();
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
	notifyServerOfHiddenItem() {
		logger.add("Saving hidden item(s) remotely...");

		const content = {
			api_version: 5,
			country: i13n.getCountryCode(),
			action: "save_hidden_list",
			uuid: Settings.get("general.uuid", false),
			items: this.arrChanges,
		};
		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		fetch(VINE_HELPER_API_V5_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		});
	}

	async garbageCollection() {
		if (!this.mapHidden) {
			return false;
		}
		if (isNaN(Settings.get("general.hiddenItemsCacheSize"))) {
			return false;
		}
		if (Settings.get("general.hiddenItemsCacheSize") < 2 || Settings.get("general.hiddenItemsCacheSize") > 9) {
			return false;
		}

		//Delete items older than 90 days
		let needsSave = false;
		let timestampNow = Math.floor(Date.now() / 1000);
		if (Settings.get("hiddenTab.lastGC") == undefined) {
			Settings.set("hiddenTab.lastGC", timestampNow);
		}

		if (Settings.get("hiddenTab.lastGC") < timestampNow - 24 * 60 * 60) {
			let expiredDate = new Date();
			expiredDate.setDate(expiredDate.getDate() - 90);

			for (const [asin, date] of this.mapHidden.entries()) {
				let itemDate = new Date(date);
				if (isNaN(itemDate.getTime())) {
					//missing date, set it
					this.mapHidden.set(asin, new Date());
					needsSave = true;
				} else if (itemDate < expiredDate) {
					//expired, delete entry
					this.mapHidden.delete(asin);
					needsSave = true;
				}
			}

			Settings.set("hiddenTab.lastGC", timestampNow);
		}
		if (needsSave) {
			this.saveList();
		}

		//Delete older items if the storage space is exceeded.
		let bytes = await getStorageSizeFull();
		const storageLimit = Settings.get("general.hiddenItemsCacheSize") * 1048576; // 9MB
		const deletionThreshold = (Settings.get("general.hiddenItemsCacheSize") - 1) * 1048576; // 8MB
		if (bytes > storageLimit) {
			let itemDeleted = 0;
			let note = new ScreenNotification();
			note.title = "Local storage quota exceeded!";
			note.lifespan = 60;
			note.content = `You've hidden so many items that your quota in the local storage has exceeded ${bytesToSize(
				storageLimit
			)}. To prevent issues, ~1MB of the oldest items are being deleted...`;
			await Notifications.pushNotification(note);

			//Give some breathing room for the notification to be displayed.
			await new Promise((r) => setTimeout(r, 500));

			// Convert the map into an array of [key, value] pairs
			let arrHidden = Array.from(this.mapHidden.entries());

			// Sort the array based on the date values (oldest first)
			arrHidden.sort((a, b) => a[1] - b[1]);

			while (bytes > deletionThreshold) {
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

				let storableVal = this.serialize(this.mapHidden);
				await chrome.storage.local.set({
					hiddenItems: storableVal,
				});
				bytes = await getStorageSizeFull();
			}

			note.title = "Local storage quota fixed!";
			note.lifespan = 60;
			note.content = `GC done, ${itemDeleted} items have been deleted. Some of these items may re-appear in your listing.`;
			await Notifications.pushNotification(note);
		}
	}

	serialize(map) {
		//truncate ms to store as unix timestamp
		const objToStore = Object.fromEntries(
			Array.from(map.entries()).map(([key, value]) => [key, Math.floor(value.getTime() / 1000)])
		);
		return JSON.stringify(objToStore);
	}

	deserialize(jsonString) {
		//multiply by 1000 to convert from unix timestamp to js Date
		const retrievedObj = JSON.parse(jsonString);
		return new Map(Object.entries(retrievedObj).map(([key, value]) => [key, new Date(value * 1000)]));
	}
}

function getStorageSizeFull() {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(function (items) {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
			} else {
				const storageSize = JSON.stringify(items).length;
				resolve(storageSize);
			}
		});
	});
}

export { HiddenListMgr };
