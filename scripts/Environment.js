import { Logger } from "./Logger.js";
var logger = new Logger();

import { Internationalization } from "./Internationalization.js";
var i13n = new Internationalization();

import { SettingsMgr } from "./SettingsMgr.js";
var Settings = new SettingsMgr();

//const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";

/**
 * Environment file, used to load and store global variables
 */

class Environment {
	static #instance = null;

	data;

	constructor() {
		if (Environment.#instance) {
			// Return the existing instance if it already exists
			return Environment.#instance;
		}
		// Initialize the instance if it doesn't exist
		Environment.#instance = this;

		logger.add("ENV: Initializing environment...");

		this.data = {};

		this.#init();

		// Request the _pluginInit script to inject the plugin scripts, if any
		chrome.runtime.sendMessage({ action: "injectPluginsContentScripts" });
	}

	async #init() {
		this.#isUltraVinerRunning();
		this.#loadAppVersion();
		this.#loadBrowingContext();

		logger.add("ENV: Waiting for settings to load...");
		await Settings.waitForLoad();
		logger.add("ENV: Settings loaded.");

		this.#loadDiscordActive();
		this.#loadCountryCode();
		this.#loadUUID();

		this.data.loadContextCompleted = true;
		logger.add("ENV: Loading context data completed.");
	}

	#isUltraVinerRunning() {
		let regex = /^.+?amazon\..+\/vine\/.*ultraviner.*?$/;
		this.data.ultraviner = regex.test(window.location.href);
	}
	#loadAppVersion() {
		let manifest = chrome.runtime.getManifest();
		this.data.appVersion = manifest.version;
	}

	#loadCountryCode() {
		if (Settings.get("general.country", false) === null) {
			const code = i13n.getCountryCode();
			if (code) {
				Settings.set("general.country", code);
			}
		}
	}

	#loadDiscordActive() {
		//If the domain if not from outside the countries supported by the discord API, disable discord
		if (["ca", "com", "co.uk"].indexOf(i13n.getDomainTLD()) == -1) {
			Settings.set("discord.active", false);
		}
	}

	#loadBrowingContext() {
		//Determine if we are browsing a queue
		const currentUrl = window.location.href;
		let regex = /^.+?amazon\..+\/vine\/vine-items(?:\?(queue|search)=(.+?))?(?:[#&].*)?$/;
		let arrMatches = currentUrl.match(regex);
		this.data.vineQueue = null;
		if (arrMatches != null) {
			this.data.vineBrowsingListing = true;
			if (arrMatches[1] == "queue" && arrMatches[2] != undefined) {
				this.data.vineQueue = arrMatches[2];
			} else if (arrMatches[1] == undefined) {
				this.data.vineQueue = "last_chance"; //Default AFA
			} else {
				this.data.vineQueue = null; //Could be a ?search, (but not a &search).
			}
		}

		//Determine if we are currently searching for an item
		regex = /^.+?amazon\..+\/vine\/vine-items(?:.*?)(?:[?&]search=(.+?))(?:[#&].*?)?$/;
		arrMatches = currentUrl.match(regex);
		this.data.vineSearch = false;
		if (arrMatches != null) {
			if (arrMatches[1] == undefined) {
				this.data.vineSearch = false;
			} else {
				this.data.vineSearch = true;
				this.data.vineQueue = null;
			}
		}

		let arrQueues = { potluck: "RFY", last_chance: "AFA", encore: "AI" };
		if (this.data.vineQueue != null) {
			this.data.vineQueueAbbr = arrQueues[this.data.vineQueue];
		}
	}

	async #loadUUID() {
		//Generate a UUID for the user
		let uuid = Settings.get("general.uuid", false);
		if (!uuid) {
			uuid = await this.#requestNewUUID();
			Settings.set("general.uuid", uuid);
			logger.add("ENV: Obtained new UUID");
		}
	}

	/** Request a new UUID from the server.
	 * @return string UUID
	 */
	async #requestNewUUID() {
		logger.add("ENV: Generating new UUID.");

		//Request a new UUID from the server
		const content = {
			api_version: 5,
			app_version: this.data.appVersion,
			action: "get_uuid",
			country: i13n.getCountryCode(),
		};
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};

		let response = await fetch(VINE_HELPER_API_V5_URL, options);

		if (!response.ok) {
			throw new Error("Network response was not ok PREBOOT:requestNewUUID");
		}

		// Parse the JSON response
		let serverResponse = await response.json();

		if (serverResponse["ok"] !== "ok") {
			throw new Error("Content response was not ok PREBOOT:requestNewUUID");
		}

		// Return the obtained UUID
		return serverResponse["uuid"];
	}

	getAPIUrl() {
		return VINE_HELPER_API_V5_URL;
	}

	//getWSSUrl() {
	//	return "wss://api.vinehelper.ovh";
	//}
}

export { Environment };
