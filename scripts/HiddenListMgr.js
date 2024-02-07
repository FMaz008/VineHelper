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
			Object.assign(this.arrHidden, data.hiddenItems);
		}
		this.garbageCollection();
	}

	async removeItem(asin, save = true) {
		if (save) await this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

		for (const id in this.arrHidden) {
			if (this.arrHidden[id].asin == asin) {
				this.arrHidden.splice(id, 1);
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
		await chrome.storage.local.set({ hiddenItems: this.arrHidden });

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
			"https://www.francoismazerolle.ca/vinehelper.php" +
			"?data=" +
			jsonArrURL;
		fetch(url);
	}

	garbageCollection() {
		if (!this.arrHidden) {
			return;
		}
		const originalLength = this.arrHidden.length;
		let expiredDate = new Date();
		expiredDate.setDate(expiredDate.getDate() - 90);

		let idx = 0;
		while (idx < this.arrHidden.length) {
			if (this.arrHidden[idx].date == "") {
				this.arrHidden[idx].date = new Date().toString();
			} else if (this.arrHidden[idx].date < expiredDate) {
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
