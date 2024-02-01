//No JQuery

class HiddenListMgr{
    arrHidden = [];
    arrChanges= [];

    constructor(){
        this.loadFromLocalStorage();
        this.garbageCollection();
	}

    async loadFromLocalStorage(){
        const data = await chrome.storage.local.get("hiddenItems");
		//Load hidden items
        if(isEmptyObj(data)){
            await chrome.storage.local.set({ 'hiddenItems': [] });
        }else{
            Object.assign(this.arrHidden, data.hiddenItems);
        }
    }

    removeItem(asin, save=true){
        if(save)
            this.loadFromLocalStorage(); //Load the list in case it was altered in a different tab

        for(const id in this.arrHidden){
            if(this.arrHidden[id].asin == asin){
                this.arrHidden.splice(id, 1);
                return this.removeItem(asin, save); //Ensure the removal of duplicate items
            }
        }

        //The server may not be in sync with the local list, and will deal with duplicate.
        this.updateArrChange({"asin" : asin, "hidden": false});

        if(save)
            this.saveList();
    }

    addItem(asin, save=true){
        if(!this.isHidden(asin))
            this.arrHidden.push({"asin" : asin, "date": new Date});

        //The server may not be in sync with the local list, and will deal with duplicate.
        this.updateArrChange({"asin" : asin, "hidden": true});

        if(save)
            this.saveList();
    }

    async saveList(){
        await chrome.storage.local.set({ 'hiddenItems': this.arrHidden });

        if(appSettings.hiddenTab.remote){
            this.notifyServerOfHiddenItem();
            this.arrChanges = [];
        }
    }

    isHidden(asin){
        if(asin == undefined)
            throw new Exception("Asin not defined");
        
        for(const id in this.arrHidden)
            if(this.arrHidden[id].asin == asin)
                return true;
        
        return false;
    }

    isChange(asin){
        for(const id in this.arrChanges)
            if(this.arrChanges[id].asin == asin)
                return i;
        
        return false;
    }

    updateArrChange(obj){
        let itemId = this.isChange(obj.asin);
        if(itemId == false)
            this.arrChanges.push(obj);
        else
            this.arrChanges[itemId] = obj;
    }

    /**
     * Send new items on the server to be added or removed from the hidden list.
     * @param [{"asin": "abc", "hidden": true}, ...] arr 
     */
    notifyServerOfHiddenItem(){
        let arrJSON = {
            "api_version":4,
            "country": vineCountry,
            "action": "save_hidden_list",
            "uuid": appSettings.general.uuid,
            "arr":this.arrChanges
        };
        let jsonArrURL = JSON.stringify(arrJSON);
        
        showRuntime("Saving hidden item(s) remotely...");
        
        //Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
        let url = "https://www.francoismazerolle.ca/vinehelper.php"
                + "?data=" + jsonArrURL;
        fetch(url);
    }

    garbageCollection(){
        var change = false;
        let expiredDate = new Date();
        expiredDate.setDate(expiredDate.getDate() - 90);
        
    
        //Splicing inside a foreach might skip the item following the deleted one, 
        //but this method is called on every page load so it is effectively inconsequential asin
        //the missing items will be caught on the next pass.
        $.each(this.arrHidden, function(key, value){
            if(key!=undefined && value["date"] < expiredDate){
                this.arrHidden.splice(key, 1);
                change = true;
            }
        });
        
        //Save array to local storage
        if(change){
            this.saveList();
        }
    }
}