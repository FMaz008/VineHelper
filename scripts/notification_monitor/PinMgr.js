import { PinnedListMgr } from "../PinnedListMgr.js";

class PinMgr {
	#getItemDOMElementCallback = null;

	constructor() {
		this._pinnedListMgr = new PinnedListMgr();
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

		// Update pin icon if this item was unpinned from another tab
		const notif = this.#getItemDOMElementCallback(asin);
		if (notif) {
			const pinIcon = notif.querySelector("#vh-pin-link-" + asin + ">div");
			if (pinIcon) {
				pinIcon.classList.remove("vh-icon-unpin");
				pinIcon.classList.add("vh-icon-pin");
				pinIcon.title = "Pin this item";
			}
		}
	}

	async pinItem(asin, queue, title, thumbnail, isParentAsin, isPreRelease, enrollmentGUID) {
		// Pin the item
		this._pinnedListMgr.addItem(asin, queue, title, thumbnail, isParentAsin, isPreRelease, enrollmentGUID);

		// Update pin icon if this item was unpinned from another tab
		const notif = this.#getItemDOMElementCallback(asin);
		if (notif) {
			const pinIcon = notif.querySelector("#vh-pin-link-" + asin + ">div");
			if (pinIcon) {
				pinIcon.classList.remove("vh-icon-pin");
				pinIcon.classList.add("vh-icon-unpin");
				pinIcon.title = "Unpin this item";
			}
		}
	}
}

export { PinMgr };
