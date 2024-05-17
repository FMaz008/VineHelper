//No JQuery

class FavouriteListMgr {
	constructor() {
		this.mapFav = new Map();
		this.listLoaded = false;

		this.broadcast = new BroadcastChannel("vine_helper");

		showRuntime("FAVOURITEMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.onmessage = function (ev) {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "favouriteItem") {
				showRuntime("Broadcast received: favourite item " + ev.data.asin);
				FavouriteList.addItem(ev.data.asin, ev.data.title, ev.data.thumbnail, false, false);
			}
			if (ev.data.type == "unfavouriteItem") {
				showRuntime("Broadcast received: unfavourite item " + ev.data.asin);
				FavouriteList.removeItem(ev.data.asin, false, false);
			}
		};
	}

	async loadFromLocalStorage() {
		const data = await browser.storage.local.get("favouriteItems");

		//Load favourite items
		if (Object.keys(data).length === 0) {
			let storableVal = JSON.stringify(Array.from(this.mapFav.entries()));
			await browser.storage.local.set({ favouriteItems: storableVal });
		} else {
			this.mapFav = new Map(JSON.parse(data.favouriteItems));
		}
		this.listLoaded = true;
		showRuntime("FAVOURITEMGR: List loaded.");
	}

	async removeItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapFav.delete(asin);

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "unfavouriteItem", asin: asin });
		}
	}

	async addItem(asin, title, thumbnail, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		this.mapFav.set(asin, { title: title, thumbnail: thumbnail });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "favouriteItem", asin: asin, title: title, thumbnail: thumbnail });
		}
	}

	async saveList() {
		let storableVal = JSON.stringify(Array.from(this.mapFav.entries()));
		await browser.storage.local.set({ favouriteItems: storableVal }, () => {
			if (browser.runtime.lastError) {
				const error = browser.runtime.lastError;
				if (error.message === "QUOTA_BYTES quota exceeded") {
					alert(`Vine Helper local storage quota exceeded! Hidden items will be trimmed to make space.`);
					HiddenList.garbageCollection();
				} else {
					alert(
						`Vine Helper encountered an error while trying to save your favourite items. Please report the following details: ${e.name}, ${e.message}`
					);
					return;
				}
			}
		});
	}

	isFavourite(asin) {
		if (asin == undefined) throw new Exception("Asin not defined");

		return this.mapFav.has(asin);
	}

	getList() {
		return this.mapFav;
	}
}
