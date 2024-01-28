
class Template {
	arrCache = [];
	arrVar = [];
	arrIf = [];
	currentURL = null;
	
	constructor() {}
		

	async loadFile(url) {

		this.currentURL = url;

		// Check if the content was already loading
		let entry = this.arrCache.find(e => e.url === url);
		if (entry == null) { // The template already exist, simply load it from memory
			//Content is not aready in arrCache, load it from the url
			const promise = fetch(url)
				.then(response => {
					if (!response.ok) throw new Error(response.statusText);
					//Reset the stored variables
					this.arrVar = [];
					this.arrIf = [];
					return response.text();
				});
			entry = { url, promise };
			this.arrCache.push(entry);
		}
		return entry.promise;
	}

	setVar(name, value) {
		let variable = this.arrVar.find(e => e.name === name);
		if (variable == null)
			this.arrVar.push({ "name": name, "value": value });
		else //Variable already exist, update the value.
			variable.value = value;
	}
	
	setIf(name, value) {
		let variable = this.arrIf.find(e => e.name === name);
		if (variable == null)
			this.arrIf.push({ "name": name, "value": value });
		else //Variable already exist, update the value.
			variable.value = value;
	}

	render(html) {
		if (html == null) {
			console.log(getRunTime() + "No content for " + this.currentURL + ", did you await loadFile()) ?");
			return "";
		}
		var output = html;
		for (let i = 0; i < this.arrVar.length; i++) {
			output = output.replaceAll("{{$" + this.arrVar[i]["name"] + "}}", this.arrVar[i]["value"]);
		}
		for (let j = 0; j < this.arrIf.length; j++) {
			if (this.arrIf[j]["value"] == true) {
				//Remove the if tags
				output = output.replaceAll(new RegExp('{{if ' + this.arrIf[j]["name"] + '}}(.*?){{endif}}', 'sg'), `$1`);
			} else {
				//Remove the if block entirely
				output = output.replaceAll(new RegExp('{{if ' + this.arrIf[j]["name"] + '}}(.*?){{endif}}', 'sg'), "");
			}

		}

		return output;
	}
}

var Tpl = new Template();