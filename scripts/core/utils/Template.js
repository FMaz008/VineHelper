import { Logger } from "/scripts/core/utils/Logger.js";
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

		// Process if conditions with a stack-based approach for proper nesting

		// Parse and evaluate the template
		const parseTemplate = (template) => {
			let pos = 0;
			let result = "";
			let stack = [];

			while (pos < template.length) {
				// Find the next tag
				const ifStart = template.indexOf("{{if ", pos);
				const elseTag = template.indexOf("{{else}}", pos);
				const endIf = template.indexOf("{{endif}}", pos);

				// Find the minimum positive position
				const positions = [
					ifStart >= 0 ? ifStart : Infinity,
					elseTag >= 0 ? elseTag : Infinity,
					endIf >= 0 ? endIf : Infinity,
				];
				const nextTagPos = Math.min(...positions);

				// No more tags found, add the remaining text if we should include content
				if (nextTagPos === Infinity) {
					if (!stack.some((item) => !item.includeContent)) {
						result += template.substring(pos);
					}
					break;
				}

				// Add the text before the tag if we should include content
				if (!stack.some((item) => !item.includeContent)) {
					result += template.substring(pos, nextTagPos);
				}

				// Process tag based on type
				if (nextTagPos === ifStart) {
					// Extract the condition name
					const endOfIf = template.indexOf("}}", nextTagPos);
					const condName = template.substring(nextTagPos + 5, endOfIf);

					// Find the condition value
					const condValue = this.arrIf.find((c) => c.name === condName)?.value || false;

					// Push current position and condition value to the stack
					stack.push({
						type: "if",
						value: condValue,
						includeContent: condValue,
					});

					pos = endOfIf + 2;
				} else if (nextTagPos === elseTag) {
					// Toggle the include flag for the current block
					if (stack.length > 0) {
						const current = stack[stack.length - 1];
						current.includeContent = !current.value;
					}

					pos = elseTag + 8; // "{{else}}".length = 8
				} else if (nextTagPos === endIf) {
					// Pop the stack
					stack.pop();
					pos = endIf + 9; // "{{endif}}".length = 9
				}
			}

			return result;
		};

		output = parseTemplate(output);

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
			this.#templatesLoaded = true;
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
