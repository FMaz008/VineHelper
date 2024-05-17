//No JQuery

class HiddenListMgr {
	constructor() {
		this.mapHidden = new Map();
		this.arrChanges = [];
		this.listLoaded = false;
		this.broadcast = new BroadcastChannel("vine_helper");

		showRuntime("HIDDENMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.onmessage = function (ev) {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "hideItem") {
				showRuntime("Broadcast received: hide item " + ev.data.asin);
				HiddenList.addItem(ev.data.asin, false, false);
			}
			if (ev.data.type == "showItem") {
				showRuntime("Broadcast received: show item " + ev.data.asin);
				HiddenList.removeItem(ev.data.asin, false, false);
			}
		};
	}

	async loadFromLocalStorage() {
		const data = await browser.storage.local.get("hiddenItems");

		if (data.hiddenItems) {
			try {
				// Try parsing the stored string as JSON
				this.mapHidden = this.deserialize(data.hiddenItems);
			} catch (error) {
				// If JSON parsing fails assume legacy format and convert to new format
				// Once the migration period is over delete this section of code
				showRuntime("Failed to parse hiddenItems as JSON, treating as array:");
				if (Array.isArray(data.hiddenItems)) {
					this.mapHidden = data.hiddenItems.reduce((map, product) => {
						map.set(product.asin, new Date(product.date));
						return map;
					}, new Map());
				} else {
					showRuntime("Invalid data format for hidden items.  Creating new map.");
					this.mapHidden = new Map(); // Initialize with an empty map if data is malformed
				}
			}
		} else {
			// No data found or empty hiddenItems, initialize an empty Map
			this.mapHidden = new Map();
		}
		this.listLoaded = true;
		showRuntime("HIDDENMGR: List loaded.");
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

		if (!this.isHidden(asin)) this.mapHidden.set(asin, new Date());

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: true });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "hideItem", asin: asin });
		}
	}

	async saveList() {
		let storableVal = this.serialize(this.mapHidden);
		await browser.storage.local.set({ hiddenItems: storableVal }, () => {
			if (browser.runtime.lastError) {
				const error = browser.runtime.lastError;
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

		if (appSettings.hiddenTab.remote) {
			this.notifyServerOfHiddenItem();
			this.arrChanges = [];
		}
	}

	isHidden(asin) {
		if (asin == undefined) throw new Exception("Asin not defined");

		return this.mapHidden.has(asin);
	}

	isChange(asin) {
		for (const id in this.arrChanges) if (this.arrChanges[id].asin == asin) return id;

		return false;
	}

	updateArrChange(obj) {
		let itemId = this.isChange(obj.asin);
		if (itemId == false) this.arrChanges.push(obj);
		else this.arrChanges[itemId] = obj;
	}

	/**
	 * Send new items on the server to be added or removed from the hidden list.
	 * @param [{"asin": "abc", "hidden": true}, ...] arr
	 */
	notifyServerOfHiddenItem() {
		let arrJSON = {
			api_version: 4,
			country: vineCountry,
			action: "save_hidden_list",
			uuid: appSettings.general.uuid,
			arr: this.arrChanges,
		};
		let jsonArrURL = JSON.stringify(arrJSON);

		showRuntime("Saving hidden item(s) remotely...");

		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		let url = "https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;
		fetch(url);
	}

	async garbageCollection() {
		if (!this.mapHidden) {
			return false;
		}
		if (isNaN(appSettings.general.hiddenItemsCacheSize)) {
			return false;
		}
		if (appSettings.general.hiddenItemsCacheSize < 2 || appSettings.general.hiddenItemsCacheSize > 9) {
			return false;
		}

		//Delete items older than 90 days
		let needsSave = false;
		let timestampNow = Math.floor(Date.now() / 1000);
		if (appSettings.hiddenTab.lastGC == undefined) {
			appSettings.hiddenTab.lastGC = timestampNow;
			saveSettings(); //preboot.js
		}

		if (appSettings.hiddenTab.lastGC < timestampNow - 24 * 60 * 60) {
			let expiredDate = new Date();
			expiredDate.setDate(expiredDate.getDate() - 90);

			for (const [asin, date] of this.mapHidden.entries()) {
				let itemDate = new Date(date);
				if (isNaN(itemDate.getTime())) {
					//missing date, set it
					this.mapHidden.set(asin, new Date());
					needsSave = true;
				} else if (itemDate < ninetyDaysAgo) {
					//expired, delete entry
					this.mapHidden.delete(asin);
					needsSave = true;
				}
			}

			appSettings.hiddenTab.lastGC = timestampNow;
			saveSettings(); //preboot.js
		}
		if (needsSave) {
			this.saveList();
		}

		//Delete older items if the storage space is exceeded.
		let bytes = await getStorageSizeFull();
		const storageLimit = appSettings.general.hiddenItemsCacheSize * 1048576; // 9MB
		const deletionThreshold = (appSettings.general.hiddenItemsCacheSize - 1) * 1048576; // 8MB
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
				await browser.storage.local.set({
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
