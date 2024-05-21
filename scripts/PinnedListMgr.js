//No JQuery

class PinnedListMgr {
	constructor() {
		this.mapPin = new Map();
		this.listLoaded = false;

		this.broadcast = new BroadcastChannel("vine_helper");

		showRuntime("PINNEDMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.onmessage = function (ev) {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "pinnedItem") {
				showRuntime("Broadcast received: pinned item " + ev.data.asin);
				PinnedList.addItem(ev.data.asin, ev.data.title, ev.data.thumbnail, false, false);
			}
			if (ev.data.type == "unpinnedItem") {
				showRuntime("Broadcast received: unpinned item " + ev.data.asin);
				PinnedList.removeItem(ev.data.asin, false, false);
			}
		};
	}

	async loadFromLocalStorage() {
		const data = await browser.storage.local.get("pinnedItems");

		//Load pinned items
		if (Object.keys(data).length === 0) {
			let storableVal = JSON.stringify(Array.from(this.mapPin.entries()));
			await browser.storage.local.set({ pinnedItems: storableVal });
		} else {
			this.mapPin = new Map(JSON.parse(data.pinnedItems));
		}
		this.listLoaded = true;
		showRuntime("PINNEDMGR: List loaded.");
	}

	async removeItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapPin.delete(asin);

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "unpinnedItem", asin: asin });
		}
	}

	async addItem(asin, title, thumbnail, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapPin.set(asin, { title: title, thumbnail: thumbnail });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "pinnedItem", asin: asin, title: title, thumbnail: thumbnail });
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
	}

	isPinned(asin) {
		if (asin == undefined) throw new Exception("Asin not defined");

		return this.mapPin.has(asin);
	}

	getList() {
		return this.mapPin;
	}
}
