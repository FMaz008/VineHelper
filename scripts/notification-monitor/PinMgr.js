import { PinnedListMgr } from "../PinnedListMgr.js";

class PinMgr {
	#getItemDOMElementCallback = null;

	constructor() {
		this._pinnedListMgr = new PinnedListMgr();

		// Register this PinMgr as an observer for broadcast events
		this._pinnedListMgr.addBroadcastObserver({
			onPinnedBroadcast: (item) => {
				// Handle pin events from other tabs
				this.pinItem(item);
			},
			onUnpinnedBroadcast: (asin) => {
				// Handle unpin events from other tabs
				this.unpinItem(asin);
			},
		});
	}

	setGetItemDOMElementCallback(callback) {
		this.#getItemDOMElementCallback = callback;
	}

	// Check if an item is already pinned
	async checkIfPinned(asin) {
		await this._pinnedListMgr.getList(); // This will wait for the list to be loaded
		return this._pinnedListMgr.isPinned(asin);
	}

	async unpinItem(asin) {
		// Unpin the item
		this._pinnedListMgr.removeItem(asin);

		// Update the icon to reflect unpinned state
		this.#updatePinIcon(asin, false);
	}

	async pinItem(item) {
		// Pin the item
		this._pinnedListMgr.addItem(item);

		// Update the icon to reflect pinned state
		this.#updatePinIcon(item.data.asin, true);
	}

	// Update the pin icon for an item
	#updatePinIcon(asin, isPinned) {
		const notif = this.#getItemDOMElementCallback(asin);
		if (notif) {
			const pinIcon = notif.querySelector("#vh-pin-link-" + asin + ">div");
			if (pinIcon) {
				if (isPinned) {
					// Item is pinned - show unpin icon (red)
					pinIcon.classList.remove("vh-icon-pin");
					pinIcon.classList.add("vh-icon-unpin");
					pinIcon.title = "Unpin this item";
				} else {
					// Item is unpinned - show pin icon (gray)
					pinIcon.classList.remove("vh-icon-unpin");
					pinIcon.classList.add("vh-icon-pin");
					pinIcon.title = "Pin this item";
				}
			}
		}
	}
}

export { PinMgr };
