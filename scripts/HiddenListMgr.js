//No JQuery

class HiddenListMgr {
	constructor() {
		this.arrHidden = [];
		this.arrChanges = [];
		this.listLoaded = false;
		this.broadcast = new BroadcastChannel("vine_helper");

		showRuntime("HIDDENMGR: Loading list");
		this.loadFromLocalStorage(); //Can't be awaited

		//Handle the reception of broadcasts:
		this.broadcast.onmessage = function (ev) {
			if (ev.data.type == undefined) return;

			if (ev.data.type == "hideItem") {
				showRuntime("Broadcast received: hide item " + ev.data.asin);
				HiddenList.addItem(ev.data.asin, false, false);
			}
			if (ev.data.type == "showItem") {
				showRuntime("Broadcast received: show item " + ev.data.asin);
				HiddenList.removeItem(ev.data.asin, false, false);
			}
		};
	}

	async loadFromLocalStorage() {
		const data = await browser.storage.local.get("hiddenItems");

		//Load hidden items
		if (Object.keys(data).length === 0) {
			await browser.storage.local.set({ hiddenItems: [] });
		} else {
			this.arrHidden = [];
			if (Array.isArray(data.hiddenItems)) {
				this.arrHidden = data.hiddenItems;
			} else {
				this.saveList(); //Variable in local storage is corrupted, save empty array.
			}
		}
		this.listLoaded = true;
		showRuntime("HIDDENMGR: List loaded.");
	}

	async removeItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		let idx = 0;
		while (idx < this.arrHidden.length) {
			if (this.arrHidden[idx].asin == asin) {
				this.arrHidden.splice(idx, 1);
			} else {
				++idx;
			}
		}

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: false });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "showItem", asin: asin });
		}
	}

	async addItem(asin, save = true, broadcast = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		if (!this.isHidden(asin)) this.arrHidden.push({ asin: asin, date: new Date().toString() });

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: true });

		if (save) this.saveList();

		//Broadcast the change to other tabs
		if (broadcast) {
			this.broadcast.postMessage({ type: "hideItem", asin: asin });
		}
	}

	async saveList() {
		await browser.storage.local.set({ hiddenItems: this.arrHidden }, () => {
			if (browser.runtime.lastError) {
				const error = browser.runtime.lastError;
				if (error.message === "QUOTA_BYTES quota exceeded") {
					alert(`Vine Helper local storage quota exceeded! Hidden items will be trimmed to make space.`);
					this.garbageCollection();
				} else {
					alert(
						`Vine Helper encountered an error while trying to save your hidden items. Please report the following details: ${e.name}, ${e.message}`
					);
					return;
				}
			}
		});

		if (appSettings.hiddenTab.remote) {
			this.notifyServerOfHiddenItem();
			this.arrChanges = [];
		}
	}

	isHidden(asin) {
		if (asin == undefined) throw new Exception("Asin not defined");

		for (const id in this.arrHidden) if (this.arrHidden[id].asin == asin) return true;

		return false;
	}

	isChange(asin) {
		for (const id in this.arrChanges) if (this.arrChanges[id].asin == asin) return id;

		return false;
	}

	updateArrChange(obj) {
		let itemId = this.isChange(obj.asin);
		if (itemId == false) this.arrChanges.push(obj);
		else this.arrChanges[itemId] = obj;
	}

	/**
	 * Send new items on the server to be added or removed from the hidden list.
	 * @param [{"asin": "abc", "hidden": true}, ...] arr
	 */
	notifyServerOfHiddenItem() {
		let arrJSON = {
			api_version: 4,
			country: vineCountry,
			action: "save_hidden_list",
			uuid: appSettings.general.uuid,
			arr: this.arrChanges,
		};
		let jsonArrURL = JSON.stringify(arrJSON);

		showRuntime("Saving hidden item(s) remotely...");

		//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
		let url = "https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;
		fetch(url);
	}

	async garbageCollection() {
		if (!this.arrHidden) {
			return false;
		}
		if (isNaN(appSettings.general.hiddenItemsCacheSize)) {
			return false;
		}
		if (appSettings.general.hiddenItemsCacheSize < 2 || appSettings.general.hiddenItemsCacheSize > 9) {
			return false;
		}

		//Delete older items if the storage space is exceeded.
		let bytes = await getStorageSizeFull();
		const storageLimit = appSettings.general.hiddenItemsCacheSize * 1048576; // 9MB
		const deletionThreshold = (appSettings.general.hiddenItemsCacheSize - 1) * 1048576; // 8MB
		if (bytes > storageLimit) {
			let itemDeleted = 0;

			let note = new ScreenNotification();
			note.title = "Local storage quota exceeded!";
			note.lifespan = 60;
			note.content = `You've hidden so many items that your quota in the local storage has exceeded ${bytesToSize(
				storageLimit
			)}. To prevent issues, ~1MB of the oldest items are being deleted...`;
			await Notifications.pushNotification(note);

			//Give some breathing room for the notification to be displayed.
			await new Promise((r) => setTimeout(r, 500));

			while (bytes > deletionThreshold) {
				//Delete 1000 items at the time
				this.arrHidden.splice(0, 1000);
				itemDeleted += 1000;
				await browser.storage.local.set({
					hiddenItems: this.arrHidden,
				});
				bytes = await getStorageSizeFull();
			}

			note.title = "Local storage quota fixed!";
			note.lifespan = 60;
			note.content = `GC done, ${itemDeleted} items have been deleted. Some of these items may re-appear in your listing.`;
			await Notifications.pushNotification(note);
		}

		//Delete items older than 90 days
		let timestampNow = Math.floor(Date.now() / 1000);
		if (appSettings.hiddenTab.lastGC == undefined) {
			appSettings.hiddenTab.lastGC = timestampNow;
			saveSettings(); //preboot.js
		}

		const originalLength = this.arrHidden.length;
		if (appSettings.hiddenTab.lastGC < timestampNow - 24 * 60 * 60) {
			let expiredDate = new Date();
			expiredDate.setDate(expiredDate.getDate() - 90);

			let idx = 0;
			while (idx < this.arrHidden.length) {
				let itemDate = new Date(this.arrHidden[idx].date); // Parse current item's date
				if (isNaN(itemDate.getTime())) {
					this.arrHidden[idx].date = new Date().toString();
				} else if (itemDate < expiredDate) {
					this.arrHidden.splice(idx, 1);
				} else {
					++idx;
				}
			}

			appSettings.hiddenTab.lastGC = timestampNow;
			saveSettings(); //preboot.js
		}
		if (this.arrHidden.length != originalLength) {
			this.saveList();
		}
	}
}
