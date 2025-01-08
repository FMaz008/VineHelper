class Logger {
	static #instance = null;
	#arrEvents;
	#startTime;

	constructor() {
		//Singleton
		if (Logger.#instance) {
			// Return the existing instance if it already exists
			return Logger.#instance;
		}
		// Initialize the instance if it doesn't exist
		Logger.#instance = this;

		this.#arrEvents = [];
		this.#startTime = Date.now();
	}

	add(desc) {
		this.#arrEvents.push({ time: Date.now() - this.#startTime, event: desc });
	}

	getContentRaw() {
		return this.#arrEvents;
	}

	async getContent() {
		try {
			await this.#generateStorageUsageForDebug();
		} catch (error) {
			console.error("Error generating runtime json");
		} finally {
			return JSON.stringify(this.getContentRaw(), null, 2).replaceAll("\n", "<br/>\n");
		}
	}

	#bytesToSize(bytes, decimals = 2) {
		if (!Number(bytes)) {
			return "0 Bytes";
		}

		const kbToBytes = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

		const index = Math.floor(Math.log(bytes) / Math.log(kbToBytes));

		return `${parseFloat((bytes / Math.pow(kbToBytes, index)).toFixed(dm))} ${sizes[index]}`;
	}

	async #generateStorageUsageForDebug() {
		try {
			const items = await this.#getStorageItems();
			for (let key in items) {
				try {
					let itemCount = "";
					const keyLength = await this.#getStorageKeyLength(key);
					const bytesUsed = await this.#getStorageKeySizeinBytes(key);

					if (key != "settings") {
						itemCount = `representing ${keyLength} items`;
					}
					this.add(`Storage used by ${key}: ${this.#bytesToSize(bytesUsed)} ${itemCount}`);
				} catch (error) {
					console.error(`Error retrieving storage data for ${key}: ${error.message}`);
				}
			}
		} catch (error) {
			console.error("Error fetching storage items:", error.message);
		}
	}

	// Helper function to get storage items as a promise
	#getStorageItems() {
		return new Promise((resolve, reject) => {
			chrome.storage.local.get(null, (items) => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve(items);
				}
			});
		});
	}

	#getStorageKeySizeinBytes(key) {
		return new Promise((resolve, reject) => {
			chrome.storage.local.get(key, function (items) {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					const storageSize = JSON.stringify(items[key]).length;
					resolve(storageSize);
				}
			});
		});
	}

	#getStorageKeyLength(key) {
		return new Promise((resolve, reject) => {
			chrome.storage.local.get(key, (items) => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					let itemSize;
					if (key == "hiddenItems" || key == "pinnedItems") {
						itemSize = this.#deserialize(items[key]).size;
					} else if (Array.isArray(items[key])) {
						itemSize = items[key].length;
					} else {
						itemSize = "n/a";
					}

					resolve(itemSize);
				}
			});
		});
	}
	#deserialize(jsonString) {
		let retrievedObj = [];
		try {
			retrievedObj = JSON.parse(jsonString);
		} catch (error) {
			return new Map();
		}
		//multiply by 1000 to convert from unix timestamp to js Date
		return new Map(Object.entries(retrievedObj).map(([key, value]) => [key, new Date(value * 1000)]));
	}
}

export { Logger };
