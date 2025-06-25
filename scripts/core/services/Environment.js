import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
var i13n = new Internationalization();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

import { DeviceFingerprintMgr } from "/scripts/core/services/DeviceFingerprintMgr.js";
import { DeviceMgr } from "/scripts/core/services/DeviceMgr.js";

import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
var cryptoKeys = new CryptoKeys();

const VINE_HELPER_API_V5_URL = "https://api.vinehelper.ovh";
//const VINE_HELPER_API_V5_URL = "http://127.0.0.1:3000";

/**
 * Environment file, used to load and store global variables
 */

class Environment {
	static #instance = null;

	data = {};

	#UUIDRequestFailed = false;
	#vvpContext = null;

	constructor() {
		if (Environment.#instance) {
			// Return the existing instance if it already exists
			return Environment.#instance;
		}
		// Initialize the instance if it doesn't exist
		Environment.#instance = this;

		logger.add("ENV: Initializing environment...");

		this._deviceMgr = new DeviceMgr(Settings);
		this._deviceFingerprintMgr = new DeviceFingerprintMgr(this, Settings);
		this.#init();

		// Request the _pluginInit script to inject the plugin scripts, if any
		chrome.runtime.sendMessage({ action: "injectPluginsContentScripts" });
	}

	async #init() {
		this.#isUltraVinerRunning();
		this.#loadAppVersion();
		this.#loadBrowsingContext();

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
		if (i13n.getDomainTLD() != null) {
			if (["ca", "com", "co.uk"].indexOf(i13n.getDomainTLD()) == -1) {
				Settings.set("discord.active", false);
			}
		}
	}

	#loadBrowsingContext() {
		//Try to obtain the queue from the vvpContext
		this.data.vineQueue = this.#readQueue(false);

		//If the queue was not obtained from the vvpContext, try to obtain it from the URL
		if (!this.data.vineQueue) {
			this.#readQueueFromURL("all_items");
		}

		//Determine if we are currently searching for an item
		let regex, arrMatches;
		const currentUrl = window.location.href;
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

		let arrQueues = { potluck: "RFY", last_chance: "AFA", encore: "AI", all_items: "ALL" };
		if (this.data.vineQueue != null) {
			this.data.vineQueueAbbr = arrQueues[this.data.vineQueue];
		}

		//Determine what page number we are on:
		regex = /&page=(\d+)?/;
		const match = currentUrl.match(regex);
		if (match) {
			this.data.vinePageNumber = match[1] ? parseInt(match[1]) : 1;
		} else {
			this.data.vinePageNumber = 1;
		}
	}

	async #loadUUID() {
		//Generate a UUID for the user
		let uuid = Settings.get("general.uuid", false);
		if (!uuid || uuid == "") {
			try {
				uuid = await this.#requestNewUUID();
				await Settings.set("general.uuid", uuid);
				logger.add("ENV: Obtained new UUID");
			} catch (error) {
				this.#UUIDRequestFailed = true;
				return false;
			}
		}

		//Generate a fingerprint
		if (
			!(await this._deviceFingerprintMgr.getFingerprintHash()) || //If the fingerprint was not generated.
			!(await this._deviceFingerprintMgr.getFingerprintId()) //If the fingerprint was not sucessfully saved.
		) {
			try {
				const deviceName = await this._deviceMgr.generateDeviceName();
				await this._deviceFingerprintMgr.generateFingerprint(uuid, deviceName);
			} catch (error) {
				//There was an error generating or submitting the fingerprint.
				//Clear the fingerprint and try again later.
				console.log(error);
				await this._deviceFingerprintMgr.clearFingerprint();
			}
		}
	}

	//Wait for the UUID to be set,
	async waitForUUID() {
		return new Promise((resolve) => {
			const checkUUID = () => {
				const uuid = Settings.get("general.uuid", false);
				if (uuid) {
					resolve(true);
				} else if (this.#UUIDRequestFailed) {
					resolve(false);
				} else {
					// If still requesting, check again after a short delay
					setTimeout(checkUUID, 50);
				}
			};
			checkUUID();
		});
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
		const s = await cryptoKeys.signData(content);
		content.s = s;
		content.pk = await cryptoKeys.getExportedPublicKey();
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};

		let response = await fetch(VINE_HELPER_API_V5_URL, options);

		if (!response.ok) {
			throw new Error("Network response was not ok ENV:requestNewUUID");
		}

		// Parse the JSON response
		let serverResponse = await response.json();

		if (serverResponse["ok"] !== "ok") {
			throw new Error("Content response was not ok ENV:requestNewUUID");
		}

		// Return the obtained UUID
		return serverResponse["uuid"];
	}

	getAPIUrl() {
		return VINE_HELPER_API_V5_URL;
	}

	getTierLevel(defaultStatus = "silver") {
		if (!this.data.tierLevel) {
			this.data.tierLevel = this.#readTierLevel();
		}
		return this.data.tierLevel ? this.data.tierLevel : defaultStatus;
	}

	#readTierLevel() {
		let status;
		try {
			const vvpContext = this.#readVVPContext();
			status = vvpContext?.voiceDetails.tierStatus == "TIER2" ? "gold" : "silver";
		} catch (err) {
			status = null;
		}
		return status;
	}

	#readVVPContext() {
		try {
			if (this.#vvpContext === null) {
				this.#vvpContext = JSON.parse(
					document.querySelector(`script[data-a-state='{"key":"vvp-context"}']`).innerHTML
				);
			}
			return this.#vvpContext;
		} catch (err) {
			return {};
		}
	}

	#readQueue(defaultQueue = false) {
		try {
			const vvpContext = this.#readVVPContext();
			if (vvpContext?.queueKey) {
				this.data.vineBrowsingListing = true;
			}
			return vvpContext?.queueKey || defaultQueue;
		} catch (err) {
			return defaultQueue;
		}
	}

	#readQueueFromURL(defaultQueue = false) {
		//Determine if we are browsing a queue
		const currentUrl = window.location.href;
		let regex = /^.+?amazon\..+\/vine\/vine-items(?:\?(queue|search)=(.+?))?(?:[#&].*)?$/;
		let arrMatches = currentUrl.match(regex);
		if (arrMatches != null) {
			this.data.vineBrowsingListing = true;
			if (arrMatches[1] == "queue" && arrMatches[2] != undefined) {
				this.data.vineQueue = arrMatches[2];
			} else if (arrMatches[1] == undefined) {
				this.data.vineQueue = defaultQueue; //Default queue
			} else {
				this.data.vineQueue = defaultQueue; //Could be a ?search, (but not a &search).
			}
		}
	}

	getSilverTierLimit() {
		if (!this.data.silverTierLimit) {
			this.data.silverTierLimit = this.#readSilverTierLimit();
		}
		return this.data.silverTierLimit;
	}

	#readSilverTierLimit() {
		const rawText = document.querySelector("#vvp-vine-participation-content ul>li").innerText;
		const regex = new RegExp("^.+?[0-9]{1}.+?([0-9,.]+).+", "m");
		const match = rawText.match(regex);
		if (match) {
			return parseFloat(match[1]);
		}
	}

	isAmazonCheckoutEnabled() {
		try {
			const vvpContext = this.#readVVPContext();
			return vvpContext?.isCheckoutEnabled;
		} catch (err) {
			return false;
		}
	}

	isFirefox() {
		return navigator.userAgent.includes("Firefox");
	}

	isSafari() {
		return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
	}

	//getWSSUrl() {
	//	return "wss://api.vinehelper.ovh";
	//}
}

export { Environment };
