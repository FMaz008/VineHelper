const TYPE_DATE = "date";
const TYPE_PRICE_DESC = "price_desc";
const TYPE_PRICE_ASC = "price_asc";

class ItemsMgr {
	imageUrls = new Set(); // Set of image URLs used for duplicate thumbnail detection (kept separate for O(1) lookup performance)
	items = new Map(); // Combined map to store both item data and DOM elements

	constructor(settings) {
		this._settings = settings;
	}

	/**
	 * Sort the items in the items map
	 */
	sortItems() {
		// Only proceed if there are items to sort
		if (this.items.size === 0) return;

		// Convert Map to array for sorting
		const itemsArray = Array.from(this.items.entries()).map(([asin, item]) => {
			return {
				asin,
				data: item.data,
				element: item.element,
			};
		});

		// Sort based on the current sort type
		itemsArray.sort((a, b) => {
			if (this._settings.get("notification.monitor.sortType") === TYPE_DATE) {
				// Sort by date, newest first
				return b.data.date - a.data.date;
			} else if (this._settings.get("notification.monitor.sortType") === TYPE_PRICE_ASC) {
				// Sort by price, lowest first
				// Treat null/undefined as 99999999 so they are at the end
				const aPrice =
					a.data.etv_min !== null && a.data.etv_min !== undefined ? parseFloat(a.data.etv_min) : 99999999;
				const bPrice =
					b.data.etv_min !== null && b.data.etv_min !== undefined ? parseFloat(b.data.etv_min) : 99999999;
				return aPrice - bPrice;
			} else {
				// Default: sort by price (TYPE_PRICE), highest first
				// Treat null/undefined as -1 so actual 0 values rank higher
				const aPrice =
					a.data.etv_min !== null && a.data.etv_min !== undefined ? parseFloat(a.data.etv_min) : -1;
				const bPrice =
					b.data.etv_min !== null && b.data.etv_min !== undefined ? parseFloat(b.data.etv_min) : -1;
				return bPrice - aPrice;
			}
		});

		// Transform the sorted array back to [key, value] pairs for the Map constructor
		this.items = new Map(
			itemsArray.map((item) => [
				item.asin,
				{
					data: item.data,
					element: item.element,
				},
			])
		);

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

		if (!this.items.has(asin)) {
			// New item
			this.items.set(asin, {
				data: {
					...itemData,
					dateAdded: new Date(),
				},
				element: null, // Element will be set later
			});
			addedStatus = true;
		} else {
			// Update existing item data, preserving the element reference
			// both the old data and the new data are merged into the existing object, new data will override old data
			const existing = this.items.get(asin);
			this.items.set(asin, {
				data: {
					...existing.data,
					...itemData,
				},
				element: existing.element,
			});
			addedStatus = false;
		}

		// Store image URL if needed for duplicate detection
		if (itemData.img_url && this._settings.get("notification.monitor.hideDuplicateThumbnail")) {
			this.imageUrls.add(itemData.img_url);
		}

		// Sort the items after adding or updating a new item
		this.sortItems();

		// Return true if the item was added, false if it was updated
		return addedStatus;
	}

	/**
	 * Store the DOM element reference on the items map
	 * @param {string} asin - The ASIN of the item
	 * @param {object} element - The DOM element to store
	 */
	storeItemDOMElement(asin, element) {
		if (this.items.has(asin)) {
			const item = this.items.get(asin);
			item.element = element;
			this.items.set(asin, item);
		} else {
			// Should not happen, but handle the case
			this.items.set(asin, {
				data: {
					asin: asin,
					dateAdded: new Date(),
				},
				element: element,
			});
		}
	}

	/**
	 * Mark an item as unavailable
	 * @param {string} asin - The ASIN of the item
	 */
	markItemUnavailable(asin) {
		if (this.items.has(asin)) {
			const item = this.items.get(asin);
			item.data.unavailable = true;
			this.items.set(asin, item);
		}
	}

	/**
	 * Get the DOM element for an item
	 * @param {string} asin - The ASIN of the item
	 * @returns {object} - The DOM element of the item
	 */
	getItemDOMElement(asin) {
		return this.items.get(asin)?.element;
	}
}

export { ItemsMgr };
