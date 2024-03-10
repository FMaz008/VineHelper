//No JQuery

class HiddenListMgr {
	arrHidden = [];
	arrChanges = [];

	constructor() {
		this.loadFromLocalStorage();
	}

	async loadFromLocalStorage() {
		const data = await chrome.storage.local.get("hiddenItems");
		//Load hidden items
		if (isEmptyObj(data)) {
			await chrome.storage.local.set({ hiddenItems: [] });
		} else {
			this.arrHidden = [];
			this.arrHidden = data.hiddenItems;
		}
		this.garbageCollection();
	}

	async removeItem(asin, save = true) {
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
	}

	async addItem(asin, save = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		if (!this.isHidden(asin))
			this.arrHidden.push({ asin: asin, date: new Date().toString() });

		//The server may not be in sync with the local list, and will deal with duplicate.
		this.updateArrChange({ asin: asin, hidden: true });

		if (save) this.saveList();
	}

	async saveList() {
		try {
			await chrome.storage.local.set({ hiddenItems: this.arrHidden });
		} catch (e) {
			if (e.name === "QuotaExceededError") {
				// The local storage space has been exceeded
				alert(
					"Vine Helper local storage quota exceeded! Hidden items will be cleared to make space."
				);
				await chrome.storage.local.set({ hiddenItems: [] });
				return false;
			} else {
				// Some other error occurred
				alert(
					"Vine Helper encountered an error while trying to save your hidden items. Please report the following details:",
					e.name,
					e.message
				);
				return false;
			}
		}
		if (appSettings.hiddenTab.remote) {
			this.notifyServerOfHiddenItem();
			this.arrChanges = [];
		}
	}

	isHidden(asin) {
		if (asin == undefined) throw new Exception("Asin not defined");

		for (const id in this.arrHidden)
			if (this.arrHidden[id].asin == asin) return true;

		return false;
	}

	isChange(asin) {
		for (const id in this.arrChanges)
			if (this.arrChanges[id].asin == asin) return i;

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
		let url =
			"https://www.vinehelper.ovh/vinehelper.php" + "?data=" + jsonArrURL;
		fetch(url);
	}

	async garbageCollection() {
		if (!this.arrHidden) return;

		//Delete older items if the storage space is exceeded.
		let bytes = chrome.storage.local.getBtyesInUse();
		if (bytes > 9 * 1048576) {
			//9MB
			//The local storage limit of 10MB and we are over 9MB
			//Delete old items until we are under the limit
			let itemDeleted = 0;

			//Older items should be at the beginning of the array
			//Delete items until we are under 8MB
			do {
				//Delete 1000 items at the time
				this.arrHidden.splice(0, 1000);
				itemDeleted += 1000;
				await chrome.storage.local.set({ hiddenItems: this.arrHidden });
			} while (chrome.storage.local.getBtyesInUse() < 8 * 1048576);

			let note = new ScreenNotification();
			note.title = "Local storage quota exceeded !";
			note.lifespan = 60;
			note.content =
				"You've hidden so many items that your quota in the local storage has exceeded 9MB. To prevent issues, " +
				itemDeleted +
				" of the oldest items have been deleted. Some of these items may re-appear in your listing.";
			await Notifications.pushNotification(note);
		}

		//Delete items older than 90 days
		const originalLength = this.arrHidden.length;
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

		if (this.arrHidden.length != originalLength) {
			this.saveList();
		}
	}
}
