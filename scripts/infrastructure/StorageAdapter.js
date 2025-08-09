/*global chrome*/

/**
 * Storage Adapter Interface
 *
 * This provides an abstraction over chrome.storage to:
 * - Enable unit testing without browser APIs
 * - Support different storage backends (local, sync, memory)
 * - Provide a consistent async/await interface
 */

/**
 * Base storage adapter interface
 */
export class StorageAdapter {
	/**
	 * Get a value from storage
	 * @param {string} key - Storage key
	 * @returns {Promise<*>} The stored value or undefined
	 */
	async get() {
		throw new Error("get() must be implemented by subclass");
	}

	/**
	 * Get multiple values from storage
	 * @param {Array<string>} keys - Array of storage keys
	 * @returns {Promise<Object>} Object with key-value pairs
	 */
	async getMultiple() {
		throw new Error("getMultiple() must be implemented by subclass");
	}

	/**
	 * Set a value in storage
	 * @param {string} key - Storage key
	 * @param {*} value - Value to store
	 * @returns {Promise<void>}
	 */
	async set() {
		throw new Error("set() must be implemented by subclass");
	}

	/**
	 * Set multiple values in storage
	 * @param {Object} items - Object with key-value pairs
	 * @returns {Promise<void>}
	 */
	async setMultiple() {
		throw new Error("setMultiple() must be implemented by subclass");
	}

	/**
	 * Remove a value from storage
	 * @param {string} key - Storage key
	 * @returns {Promise<void>}
	 */
	async remove() {
		throw new Error("remove() must be implemented by subclass");
	}

	/**
	 * Clear all values from storage
	 * @returns {Promise<void>}
	 */
	async clear() {
		throw new Error("clear() must be implemented by subclass");
	}
}

/**
 * Chrome storage adapter for production use
 */
export class ChromeStorageAdapter extends StorageAdapter {
	#storage;

	constructor(storageArea = "local") {
		super();
		this.#storage = chrome.storage[storageArea];
	}

	async get(key) {
		return new Promise((resolve, reject) => {
			this.#storage.get(key, (result) => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve(result[key]);
				}
			});
		});
	}

	async getMultiple(keys) {
		return new Promise((resolve, reject) => {
			this.#storage.get(keys, (result) => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve(result);
				}
			});
		});
	}

	async set(key, value) {
		return new Promise((resolve, reject) => {
			// Try service worker messaging first, fall back to direct storage if it fails
			chrome.runtime.sendMessage(
				{
					type: "saveToLocalStorage",
					key,
					value,
				},
				(response) => {
					if (chrome.runtime.lastError) {
						// If service worker messaging fails (e.g., "message port closed"),
						// fall back to direct storage
						if (chrome.runtime.lastError.message.includes("message port closed")) {
							this.#storage.set({ [key]: value }, () => {
								if (chrome.runtime.lastError) {
									const error = chrome.runtime.lastError;
									if (error.message && error.message.includes("quota")) {
										const quotaError = new Error(error.message);
										quotaError.name = "QuotaExceededError";
										reject(quotaError);
									} else {
										reject(new Error(error.message));
									}
								} else {
									resolve();
								}
							});
						} else {
							reject(new Error(chrome.runtime.lastError.message));
						}
					} else if (response && response.success) {
						resolve();
					} else {
						const error = new Error(response?.error || "Storage operation failed");
						if (response?.errorName) {
							error.name = response.errorName;
						}
						reject(error);
					}
				}
			);
		});
	}
	async setMultiple(items) {
		return new Promise((resolve, reject) => {
			this.#storage.set(items, () => {
				if (chrome.runtime.lastError) {
					const error = chrome.runtime.lastError;
					// Safari-specific quota error handling
					if (error.message && error.message.includes("Exceeded storage quota")) {
						const quotaError = new Error(error.message);
						quotaError.name = "QuotaExceededError";
						reject(quotaError);
					} else if (error.message && error.message.includes("QUOTA_BYTES quota exceeded")) {
						const quotaError = new Error(error.message);
						quotaError.name = "QuotaExceededError";
						reject(quotaError);
					} else {
						reject(new Error(error.message));
					}
				} else {
					resolve();
				}
			});
		});
	}

	async remove(key) {
		return new Promise((resolve, reject) => {
			this.#storage.remove(key, () => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve();
				}
			});
		});
	}

	async clear() {
		return new Promise((resolve, reject) => {
			this.#storage.clear(() => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve();
				}
			});
		});
	}
}

/**
 * In-memory storage adapter for testing
 */
export class MemoryStorageAdapter extends StorageAdapter {
	#data;

	constructor() {
		super();
		this.#data = new Map();
	}

	async get(key) {
		return this.#data.get(key);
	}

	async getMultiple(keys) {
		const result = {};
		for (const key of keys) {
			const value = this.#data.get(key);
			if (value !== undefined) {
				result[key] = value;
			}
		}
		return result;
	}

	async set(key, value) {
		this.#data.set(key, value);
	}

	async setMultiple(items) {
		for (const [key, value] of Object.entries(items)) {
			this.#data.set(key, value);
		}
	}

	async remove(key) {
		this.#data.delete(key);
	}

	async clear() {
		this.#data.clear();
	}
}
