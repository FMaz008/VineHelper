/*global chrome*/
import { Tile } from "../../ui/components/Tile.js";

const TYPE_DATE_ASC = "date_asc";
const TYPE_DATE_DESC = "date_desc";
const TYPE_PRICE_DESC = "price_desc";
const TYPE_PRICE_ASC = "price_asc";

class ItemsMgr {
	imageUrls = new Set(); // Set of image URLs used for duplicate thumbnail detection (kept separate for O(1) lookup performance)
	items = new Map(); // Map to store item data
	domElements = new WeakMap(); // WeakMap for DOM elements to allow garbage collection
	tiles = new WeakMap(); // WeakMap for Tile instances

	// URL string interning pool to prevent duplicate strings in memory
	static #urlInternPool = new Map();

	constructor(settings) {
		this._settings = settings;
	}

	/**
	 * Intern a URL string to prevent duplicates in memory
	 * @param {string} url - The URL to intern
	 * @returns {string} The interned URL string
	 */
	static #internUrl(url) {
		if (!url) return url;

		const existing = ItemsMgr.#urlInternPool.get(url);
		if (existing) {
			return existing;
		}

		ItemsMgr.#urlInternPool.set(url, url);
		return url;
	}

	/**
	 * Clean up old URLs from the intern pool (call periodically)
	 * @param {number} maxPoolSize - Maximum number of URLs to keep in pool
	 */
	static cleanupUrlPool(maxPoolSize = 1000) {
		// If pool is too large, clear oldest entries
		if (ItemsMgr.#urlInternPool.size > maxPoolSize) {
			// Convert to array, sort by insertion order (Map maintains order)
			const entries = Array.from(ItemsMgr.#urlInternPool.entries());
			const toKeep = entries.slice(-maxPoolSize); // Keep the most recent

			// Clear and rebuild with recent entries only
			ItemsMgr.#urlInternPool.clear();
			for (const [url, value] of toKeep) {
				ItemsMgr.#urlInternPool.set(url, value);
			}
		}
	}

	/**
	 * Sort the items in the items map
	 */
	sortItems() {
		// Only proceed if there are items to sort
		if (this.items.size === 0) {
			return [];
		}

		const sortType = this._settings.get("notification.monitor.sortType");

		// Convert Map to array for sorting - reuse array to reduce allocations
		const itemsArray = [];
		for (const [asin, item] of this.items.entries()) {
			itemsArray.push({
				asin,
				data: item.data,
				element: item.element,
				tile: item.tile,
			});
		}

		// Sort based on the current sort type
		itemsArray.sort((a, b) => {
			if (sortType === TYPE_PRICE_ASC) {
				// Sort by price, lowest first
				// Treat null/undefined as 99999999 so they are at the end
				const aPrice = parseFloat(a.data.etv_min || 99999999); // || will match null/undefined/""/false
				const bPrice = parseFloat(b.data.etv_min || 99999999);
				return aPrice - bPrice;
			} else if (sortType === TYPE_PRICE_DESC) {
				// Sort by price, highest first
				// Treat null/undefined as -1 so actual 0 values rank higher
				const aPrice = parseFloat(a.data.etv_min || -1); // || will match null/undefined/""/false
				const bPrice = parseFloat(b.data.etv_min || -1);
				return bPrice - aPrice;
			} else if (sortType === TYPE_DATE_ASC) {
				// Sort by date, oldest first
				const aDate = a.data.timestamp || 0;
				const bDate = b.data.timestamp || 0;
				return aDate - bDate;
			} else {
				// Default: sort by date (TYPE_DATE_DESC), newest first
				const aDate = a.data.timestamp || 0;
				const bDate = b.data.timestamp || 0;
				return bDate - aDate;
			}
		});

		// For price-based sorting, update the Map order
		if (sortType === TYPE_PRICE_ASC || sortType === TYPE_PRICE_DESC) {
			// Rebuild the map in sorted order - avoid map() allocation
			const sortedEntries = [];
			for (const item of itemsArray) {
				sortedEntries.push([
					item.asin,
					{
						data: item.data,
						element: item.element,
						tile: item.tile,
					},
				]);
			}
			this.items = new Map(sortedEntries);
		}

		return itemsArray;
	}

	/** Update the ETV of the items entry for the given ASIN
	 * @param {string} asin - The ASIN of the item
	 * @param {float} etv - The ETV value
	 * @returns {boolean} - True if the ETV was updated, false if the entry doesn't exist
	 */
	updateItemETV(asin, etv) {
		if (!this.items.has(asin)) {
			return false;
		}

		const item = this.items.get(asin);

		// Update min and max ETV values
		if (!item.data.etv_min || etv < item.data.etv_min) {
			item.data.etv_min = etv;
		}

		if (!item.data.etv_max || etv > item.data.etv_max) {
			item.data.etv_max = etv;
		}

		// Update the Map
		this.items.set(asin, item);
		// Sort the items after adding or updating a new item
		this.sortItems();

		return true;
	}

	/**
	 * Update the tier of the items entry for the given ASIN
	 * @param {string} asin - The ASIN of the item
	 * @param {string} tier - The tier value (silver or gold)
	 * @returns {boolean} - True if the tier was updated, false if the entry doesn't exist
	 */
	updateItemTier(asin, tier) {
		if (!this.items.has(asin)) {
			return false;
		}

		const item = this.items.get(asin);
		item.data.tier = tier;
		this.items.set(asin, item);
		this.sortItems();

		return true;
	}

	/**
	 * Add or update item data in the items Map
	 * @param {string} asin - The ASIN of the item
	 * @param {object} itemData - JSON object containing the item data
	 */
	addItemData(asin, itemData) {
		// Create a new item object or update existing one
		let addedStatus = false;

		// Intern URL strings to prevent duplicates in memory
		const internedData = {
			...itemData,
			img_url: ItemsMgr.#internUrl(itemData.img_url),
			search_url: ItemsMgr.#internUrl(itemData.search_url),
			// Intern any other URL fields that might exist
		};

		if (!this.items.has(asin)) {
			// New item
			this.items.set(asin, {
				data: {
					...internedData, //The spread operator will convert null values to empty strings.
					dateAdded: new Date(),
				},
			});
			addedStatus = true;

			// DEBUG: Track new item additions
			if (this._settings?.get("general.debugItemProcessing")) {
				console.log("[DEBUG-ITEMSMGR] New item added", {
					asin,
					imgUrl: internedData.img_url,
					totalItems: this.items.size,
					timestamp: new Date().toISOString(),
				});
			}
		} else {
			// Update existing item data, preserving the element reference
			// both the old data and the new data are merged into the existing object, new data will override old data
			const existing = this.items.get(asin);

			// DEBUG: Track updates to existing items
			if (this._settings?.get("general.debugItemProcessing")) {
				console.log("[DEBUG-ITEMSMGR] Updating existing item", {
					asin,
					oldImgUrl: existing.data.img_url,
					newImgUrl: internedData.img_url,
					timestamp: new Date().toISOString(),
				});
			}

			this.items.set(asin, {
				data: {
					...existing.data, //The spread operator will convert null values to empty strings.
					...internedData, //The spread operator will convert null values to empty strings.
				},
			});
			addedStatus = false;
		}

		//Convert back the empty string values to null for etv_min and etv_max
		if (this.items.get(asin).data.etv_min === "") {
			this.items.get(asin).data.etv_min = null;
		}
		if (this.items.get(asin).data.etv_max === "") {
			this.items.get(asin).data.etv_max = null;
		}

		// Store image URL if needed for duplicate detection
		if (internedData.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this.imageUrls.add(internedData.img_url);
		}

		// Sort the items after adding or updating a new item
		this.sortItems();

		// Return true if the item was added, false if it was updated
		return addedStatus;
	}

	/**
	 * Store the DOM element reference in WeakMap
	 * @param {string} asin - The ASIN of the item
	 * @param {object} element - The DOM element to store
	 * @returns {boolean} - Returns true if the item was marked as unavailable
	 */
	storeItemDOMElement(asin, element) {
		if (this.items.has(asin)) {
			const item = this.items.get(asin);

			// Store DOM element in WeakMap using item object as key
			this.domElements.set(item, element);

			// Store Tile instance in WeakMap
			const tile = new Tile(element, null);
			this.tiles.set(item, tile);

			// Check if this item was marked as unavailable before its DOM was ready
			return item.data.unavailable == 1;
		} else {
			throw new Error(`Item ${asin} not found in items map`);
		}
	}

	/**
	 * Mark an item as unavailable
	 * @param {string} asin - The ASIN of the item
	 */
	markItemUnavailable(asin) {
		if (this.items.has(asin)) {
			const item = this.items.get(asin);
			item.data.unavailable = 1; // Use 1 for consistency with server data
			this.items.set(asin, item);
		}
	}

	/**
	 * Get the DOM element for an item
	 * @param {string} asin - The ASIN of the item
	 * @returns {object} - The DOM element of the item
	 */
	getItemDOMElement(asin) {
		const item = this.items.get(asin);
		if (item) {
			// Store DOM element in WeakMap using item object as key
			const element = this.domElements.get(item);
			if (element) {
				return element;
			}
		}
		// Fallback to querying the DOM directly
		//return document.getElementById(`vh-notification-${asin}`);
		return null;
	}

	/**
	 * Get the tile
	 * @returns {object} - The tile
	 */
	getItemTile(asin) {
		const item = this.items.get(asin);
		if (item) {
			// Check if tile exists in WeakMap
			let tile = this.tiles.get(item);
			if (!tile) {
				// Create tile if we have a DOM element
				const element = this.domElements.get(item);
				if (element) {
					tile = new Tile(element, null);
					this.tiles.set(item, tile);
				}
			}
			return tile;
		}
		return null;
	}

	removeAsin(asin) {
		// CRITICAL FIX: WeakMaps do NOT automatically clean up when the item is removed
		// from the main Map because the item object may still be referenced elsewhere
		// We must explicitly clean up WeakMap entries to prevent memory leaks

		const item = this.items.get(asin);
		if (item) {
			const imgUrl = item?.data?.img_url;
			if (imgUrl && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
				this.imageUrls.delete(imgUrl);
			}

			// Explicitly remove from WeakMaps BEFORE removing from main Map
			// This ensures proper cleanup even if the item object is still referenced
			this.domElements.delete(item);
			this.tiles.delete(item);

			// Now remove from the main Map
			this.items.delete(asin);
		}
	}
}

export { ItemsMgr };
