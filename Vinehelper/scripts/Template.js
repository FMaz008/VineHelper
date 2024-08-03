//No JQuery
class Template {
	constructor() {
		this.arrCache = [];
		this.arrVar = [];
		this.arrIf = [];
		this.currentURL = null;
	}

	async loadFile(url) {
		this.currentURL = url;

		return TplMgr.getTemplate(url);
	}

	setVar(name, value) {
		let variable = this.arrVar.find((e) => e.name === name);
		if (variable == null) this.arrVar.push({ name: name, value: value });
		//Variable already exist, update the value.
		else variable.value = value;
	}

	setIf(name, value) {
		let variable = this.arrIf.find((e) => e.name === name);
		if (variable == null) this.arrIf.push({ name: name, value: value });
		//Variable already exist, update the value.
		else variable.value = value;
	}

	render(html, convertToDOMObject = false) {
		if (html == null) {
			showRuntime("No content for " + this.currentURL + ", did you await loadFile()) ?");
			return "";
		}
		var output = html;
		for (let i = 0; i < this.arrVar.length; i++) {
			output = output.replaceAll("{{$" + this.arrVar[i]["name"] + "}}", this.arrVar[i]["value"]);
		}
		for (let j = 0; j < this.arrIf.length; j++) {
			if (this.arrIf[j]["value"] == true) {
				//Remove the if tags
				output = output.replaceAll(
					new RegExp("{{if " + this.arrIf[j]["name"] + "}}(.*?){{endif}}", "sg"),
					`$1`
				);
			} else {
				//Remove the if block entirely
				output = output.replaceAll(new RegExp("{{if " + this.arrIf[j]["name"] + "}}(.*?){{endif}}", "sg"), "");
			}
		}

		if (!convertToDOMObject) {
			return output;
		}

		//Otherwise, convert the HTML string to a DOM element.
		let parser = new DOMParser();
		let doc = parser.parseFromString(output, "text/html");
		let element = doc.body.firstChild; // Use firstChild to get the top-level element
		return element;
	}
}

class TemplateMgr {
	constructor() {
		this.arrTemplate = [];
		this.loadTempateFromLocalStorage();
	}

	async loadTempateFromLocalStorage() {
		const data = await chrome.storage.local.get("arrTemplate");
		if (Object.keys(data).length === 0) {
			showRuntime("TEMPLATE: No template in localstorage, will load them from files as needed...");
			return;
		}
		this.arrTemplate = data.arrTemplate;
	}

	async getTemplate(url) {
		let content = this.arrTemplate.find((e) => e.url === url);
		if (content != null) {
			showRuntime("TEMPLATE: Loaded template " + url + " from memory.");
			return content.prom;
		}

		//Not found in memory, which was loaded from local storage. Fetch the file.
		const prom = await this.loadTemplateFromFile(url);
		this.arrTemplate.push({ url, prom });

		//Save new file to local storage
		await chrome.storage.local.set({ arrTemplate: this.arrTemplate });

		return prom;
	}

	async loadTemplateFromFile(url) {
		showRuntime("TEMPLATE: Loading template " + url + " from file.");

		const promise = fetch(chrome.runtime.getURL(url))
			.then((response) => {
				if (!response.ok) {
					throw new Error(response.statusText + " " + url);
				}
				return response.text();
			})
			.catch((error) => {
				// Handle the error here
				return "";
			});

		return promise;
	}

	async flushLocalStorage() {
		await chrome.storage.local.set({ arrTemplate: [] });
		this.arrTemplate = [];
		showRuntime("TEMPLATE: Flushed template cache.");

		let note = new ScreenNotification();
		note.title = "Template cache flushed.";
		note.lifespan = 3;
		note.content = "";
		note.title_only = true;
		Notifications.pushNotification(note);
	}
}
