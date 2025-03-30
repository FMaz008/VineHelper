import { Logger } from "./Logger.js";
var logger = new Logger();

class Template {
	static #instance = null;
	#tplMgr;

	constructor() {
		if (Template.#instance) {
			// Return the existing instance if it already exists
			return Template.#instance;
		}
		// Initialize the instance if it doesn't exist
		Template.#instance = this;

		this.arrCache = [];
		this.arrVar = [];
		this.arrIf = [];
		this.currentURL = null;
		this.#tplMgr = new TemplateMgr(); //Singleton
	}

	async loadFile(url) {
		this.currentURL = url;

		return this.#tplMgr.getTemplate(url);
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

	clearVariables() {
		this.arrCache = [];
		this.arrVar = [];
		this.arrIf = [];
	}

	render(html, convertToDOMObject = false) {
		if (html == null) {
			logger.add("No content for " + this.currentURL + ", did you await loadFile()) ?");
			return "";
		}
		var output = html;
		for (let i = 0; i < this.arrVar.length; i++) {
			output = output.replaceAll("{{$" + this.arrVar[i]["name"] + "}}", this.arrVar[i]["value"]);
		}
		for (let j = 0; j < this.arrIf.length; j++) {
			const name = this.arrIf[j]["name"];
			if (this.arrIf[j]["value"] == true) {
				// If condition is true, keep content before {{else}} (if it exists) and remove the else part
				output = output.replaceAll(new RegExp("{{if " + name + "}}(.*?){{else}}.*?{{endif}}", "sg"), "$1");
				// Also handle the case where there is no {{else}}
				output = output.replaceAll(new RegExp("{{if " + name + "}}(.*?){{endif}}", "sg"), "$1");
			} else {
				// If condition is false, remove content before {{else}} and keep content after {{else}} (if it exists)
				output = output.replaceAll(new RegExp("{{if " + name + "}}.*?{{else}}(.*?){{endif}}", "sg"), "$1");
				// Also handle the case where there is no {{else}} - remove the entire block
				output = output.replaceAll(new RegExp("{{if " + name + "}}.*?{{endif}}", "sg"), "");
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

	async flushLocalStorage() {
		await chrome.storage.local.set({ arrTemplate: [] });
		this.#tplMgr.arrTemplate = [];
		this.clearVariables(); // Clear variables when flushing storage
		logger.add("TEMPLATE: Flushed template cache.");
	}
}

class TemplateMgr {
	static #instance = null;
	#templatesLoaded = false;
	constructor() {
		//Singleton
		if (TemplateMgr.#instance) {
			// Return the existing instance if it already exists
			return TemplateMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		TemplateMgr.#instance = this;

		this.arrTemplate = [];
		this.loadTempateFromLocalStorage();
	}

	async loadTempateFromLocalStorage() {
		const data = await chrome.storage.local.get("arrTemplate");
		if (Object.keys(data).length === 0) {
			logger.add("TEMPLATE: No template in localstorage, will load them from files as needed...");
			return;
		}
		this.arrTemplate = data.arrTemplate;
		this.#templatesLoaded = true;
	}

	async getTemplate(url) {
		//Wait until the template are loaded from local storage
		while (!this.#templatesLoaded) {
			await new Promise((r) => setTimeout(r, 50));
		}

		//Search for the template in the memory
		let content = this.arrTemplate.find((e) => {
			return e.url === url;
		});
		if (content != null) {
			logger.add("TEMPLATE: Loaded template " + url + " from memory.");
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
		logger.add("TEMPLATE: Loading template " + url + " from file.");

		const promise = fetch(chrome.runtime.getURL(url))
			.then((response) => {
				if (!response.ok) {
					throw new Error(response.statusText + " " + url);
				}
				return response.text();
			})
			.catch((error) => {
				// Handle the error here
				return error + " " + chrome.runtime.getURL(url);
			});

		return promise;
	}
}

export { Template };
