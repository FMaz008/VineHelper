/*global chrome*/

import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();

import { Internationalization } from "./Internationalization.js";
const i13n = new Internationalization();

import { Environment } from "./Environment.js";
const env = new Environment();

import { CryptoKeys } from "./CryptoKeys.js";
const cryptoKeys = new CryptoKeys();

import { Item } from "./Item.js";

class PinnedListMgr {
	static #instance = null;

	listLoaded;

	constructor() {
		if (PinnedListMgr.#instance) {
			// Return the existing instance if it already exists
			return PinnedListMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		PinnedListMgr.#instance = this;

		this.mapPin = new Map();
		this.listLoaded = false;
		this.arrChanges = [];
		this.broadcast = new BroadcastChannel("VineHelper");

		logger.add("PINNEDMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.addEventListener("message", (ev) => {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "pinnedItem") {
				logger.add("Broadcast received: pinned item " + ev.data.asin);
				const item = new Item({
					asin: ev.data.asin,
					queue: ev.data.queue,
					title: ev.data.title,
					img_url: ev.data.thumbnail,
					is_parent_asin: ev.data.is_parent_asin,
					enrollment_guid: ev.data.enrollment_guid,
					is_pre_release: ev.data.is_pre_release,
				});
				this.addItem(item, false, false);
			}
			if (ev.data.type == "unpinnedItem") {
				logger.add("Broadcast received: unpinned item " + ev.data.asin);
				this.removeItem(ev.data.asin, false, false);
			}
		});
	}

	async loadFromLocalStorage() {
		const data = await chrome.storage.local.get("pinnedItems");
		if (data.pinnedItems) {
			try {
				//Detect if the content is a string of JSON or an object
				if (typeof data.pinnedItems === "string") {
					this.mapPin = new Map(JSON.parse(data.pinnedItems));
				} else {
					this.mapPin = new Map(Object.entries(data.pinnedItems));
				}
			} catch (error) {
				// If JSON parsing fails assume legacy format and convert to new format
				// Once the migration period is over delete this section of code
				logger.add("Failed to parse pinnedItems as JSON, treating as array:");
				if (Array.isArray(data.pinnedItems)) {
					this.mapPin = data.pinnedItems.reduce((map, product) => {
						map.set(product.asin, {
							title: product.title,
							thumbnail: product.thumbnail,
							is_parent_asin: product.is_parent_asin,
							enrollment_guid: product.enrollment_guid,
							is_pre_release: product.is_pre_release ? true : false,
						});
						return map;
					}, new Map());
				} else {
					logger.add("Invalid data format for pinned items.  Creating new map.");
					this.mapPin = new Map(); // Initialize with an empty map if data is malformed
				}
			}
		} else {
			// No data found or empty pinnedItems, initialize an empty Map
			this.mapPin = new Map();
		}

		this.listLoaded = true;
		logger.add("PINNEDMGR: List loaded.");
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

	async addItem(item, save = true, broadcast = true) {
		if (!(item instanceof Item)) {
			throw new Error("item is not an instance of Item");
		}

		let { asin, queue, title, img_url, is_parent_asin, enrollment_guid, is_pre_release } = item.data;
		if (!queue) {
			queue = "encore"; //Not really a good fix but if there is no known queue, assume it's AI.
		}
		if (!asin || !title || !img_url || is_parent_asin == undefined || !enrollment_guid) {
			throw new Error("Invalid data");
		}

		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapPin.set(asin, {
			date_added: Date.now(),
			title: title,
			queue: queue,
			thumbnail: img_url,
			is_parent_asin: is_parent_asin,
			enrollment_guid: enrollment_guid,
			is_pre_release: is_pre_release,
		});

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({
			asin: asin,
			pinned: true,
			queue: queue,
			title: title,
			thumbnail: img_url,
			is_parent_asin: is_parent_asin,
			enrollment_guid: enrollment_guid,
			is_pre_release: is_pre_release,
		});

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({
				type: "pinnedItem",
				asin: asin,
				queue: queue,
				title: title,
				thumbnail: img_url,
				is_parent_asin: is_parent_asin,
				enrollment_guid: enrollment_guid,
				is_pre_release: is_pre_release,
			});
		}
	}

	async saveList(remoteSave = true) {
		let storableVal = Object.fromEntries(this.mapPin);
		await chrome.storage.local.set({ pinnedItems: storableVal }, () => {
			if (chrome.runtime.lastError) {
				const error = chrome.runtime.lastError;
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

		if (remoteSave && Settings.isPremiumUser(1) && Settings.get("pinnedTab.remote")) {
			await this.notifyServerOfChangedItem();
			this.arrChanges = [];
		}
	}

	/**
	 * Send new items on the server to be added or removed from the changed list.
	 */
	async notifyServerOfChangedItem() {
		const content = {
			api_version: 5,
			app_version: env.data.appVersion,
			country: i13n.getCountryCode(),
			action: "save_pinned_list",
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

	async getList() {
		while (!this.listLoaded) {
			await new Promise((r) => setTimeout(r, 50));
		}
		return this.mapPin;
	}
}

export { PinnedListMgr };
