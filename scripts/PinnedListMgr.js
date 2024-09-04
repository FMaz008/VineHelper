//No JQuery

class PinnedListMgr {
	constructor() {
		this.mapPin = new Map();
		this.listLoaded = false;
		this.arrChanges = [];
		this.broadcast = new BroadcastChannel("vine_helper");

		showRuntime("PINNEDMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.onmessage = function (ev) {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "pinnedItem") {
				showRuntime("Broadcast received: pinned item " + ev.data.asin);
				this.addItem(
					ev.data.asin,
					ev.data.title,
					ev.data.thumbnail,
					ev.data.is_parent_asin,
					ev.data.enrollment_guid,
					false,
					false
				);
			}
			if (ev.data.type == "unpinnedItem") {
				showRuntime("Broadcast received: unpinned item " + ev.data.asin);
				this.removeItem(ev.data.asin, false, false);
			}
		};
	}

	async loadFromLocalStorage() {
		const data = await browser.storage.local.get("pinnedItems");

		if (data.pinnedItems) {
			try {
				// Try parsing the stored string as JSON
				this.mapPin = new Map(JSON.parse(data.pinnedItems));
			} catch (error) {
				// If JSON parsing fails assume legacy format and convert to new format
				// Once the migration period is over delete this section of code
				showRuntime("Failed to parse pinnedItems as JSON, treating as array:");
				if (Array.isArray(data.pinnedItems)) {
					this.mapPin = data.pinnedItems.reduce((map, product) => {
						map.set(product.asin, {
							title: product.title,
							thumbnail: product.thumbnail,
							is_parent_asin: product.is_parent_asin,
							enrollment_guid: product.enrollment_guid,
						});
						return map;
					}, new Map());
				} else {
					showRuntime("Invalid data format for pinned items.  Creating new map.");
					this.mapPin = new Map(); // Initialize with an empty map if data is malformed
				}
			}
		} else {
			// No data found or empty pinnedItems, initialize an empty Map
			this.mapPin = new Map();
		}

		this.listLoaded = true;
		showRuntime("PINNEDMGR: List loaded.");
	}

	async removeItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapPin.delete(asin);

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, pinned: false });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "unpinnedItem", asin: asin });
		}
	}

	async addItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapPin.set(asin, {
			title: title,
			queue: queue,
			thumbnail: thumbnail,
			is_parent_asin: isParentAsin,
			enrollment_guid: enrollmentGUID,
		});

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({
			asin: asin,
			pinned: true,
			queue: queue,
			title: title,
			thumbnail: thumbnail,
			is_parent_asin: isParentAsin,
			enrollment_guid: enrollmentGUID,
		});

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({
				type: "pinnedItem",
				asin: asin,
				queue: queue,
				title: title,
				thumbnail: thumbnail,
				is_parent_asin: isParentAsin,
				enrollment_guid: enrollmentGUID,
			});
		}
	}

	async saveList() {
		let storableVal = JSON.stringify(Array.from(this.mapPin.entries()));
		await browser.storage.local.set({ pinnedItems: storableVal }, () => {
			if (browser.runtime.lastError) {
				const error = browser.runtime.lastError;
				if (error.message === "QUOTA_BYTES quota exceeded") {
					alert(`Vine Helper local storage quota exceeded! Hidden items will be trimmed to make space.`);
					HiddenList.garbageCollection();
				} else {
					alert(
						`Vine Helper encountered an error while trying to save your pinned items. Please report the following details: ${e.name}, ${e.message}`
					);
					return;
				}
			}
		});

		if (appSettings.hiddenTab.remote) {
			this.notifyServerOfChangedItem();
			this.arrChanges = [];
		}
	}

	/**
	 * Send new items on the server to be added or removed from the changed list.
	 */
	notifyServerOfChangedItem() {
		let arrJSON = {
			api_version: 4,
			country: vineCountry,
			action: "save_pinned_list",
			uuid: appSettings.general.uuid,
		};
		let jsonArrURL = JSON.stringify(arrJSON);

		showRuntime("Saving pinned item(s) remotely...");

		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		let url = "https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;
		fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: JSON.stringify(this.arrChanges),
		});
	}

	isPinned(asin) {
		if (asin == undefined) throw new Exception("Asin not defined");

		return this.mapPin.has(asin);
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

	getList() {
		return this.mapPin;
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
		return new Map(Object.entries(retrievedObj).map(([key, value]) => [key, value]));
	}
}
