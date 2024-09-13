/**
 * I think this class is useless.
 */

class ListMgr {
	constructor() {
		this.mapItem = new Map();
		this.arrChanges = [];
		this.listLoaded = false;
		this.broadcast = new BroadcastChannel("vine_helper");
	}

	processLocalStorageData(jsonItems) {
		if (jsonItems) {
			try {
				// Try parsing the stored string as JSON
				this.mapItem = this.deserialize(jsonItems);
			} catch (error) {
				// If JSON parsing fails assume legacy format and convert to new format
				// Once the migration period is over delete this section of code
				showRuntime("Failed to parse hiddenItems as JSON, treating as array:");
				if (Array.isArray(jsonItems)) {
					this.mapItem = jsonItems.reduce((map, product) => {
						map.set(product.asin, new Date(product.date));
						return map;
					}, new Map());
				} else {
					showRuntime("Invalid data format for hidden items.  Creating new map.");
					this.mapItem = new Map(); // Initialize with an empty map if data is malformed
				}
			}
		} else {
			// No data found or empty hiddenItems, initialize an empty Map
			this.mapItem = new Map();
		}
		this.listLoaded = true;
	}

	async removeItem(asin, save = true, broadcastData = null) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapItem.delete(asin);

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, onList: false });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		this.broadcastChange(broadcastData);
	}

	async addItem(asin, save = true, broadcastData = null) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		if (!this.mapItem.has(asin)) {
			this.mapItem.set(asin, new Date());
		}

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, onList: true });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		this.broadcastChange(broadcastData);
	}

	broadcastChange(broadcastData = null) {
		if (broadcastData !== null) {
			this.broadcast.postMessage(broadcastData);
		}
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
	 *
	 */
	notifyServerOfItemChanges(actionName) {
		const content = {
			api_version: 5,
			country: vineCountry,
			action: actionName,
			uuid: appSettings.general.uuid,
			arr: this.arrChanges,
		};
		showRuntime("Saving " + actionName + " item(s) remotely...");

		fetch(VINE_HELPER_API_V5_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		});
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
