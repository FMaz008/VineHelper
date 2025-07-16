/*global chrome*/

import { Streamy } from "../../core/utils/Streamy.js";
import { keywordMatch } from "../../core/utils/KeywordMatch.js";
import { SettingsMgr } from "../../core/services/SettingsMgrCompat.js";
import { Item } from "../../core/models/Item.js";
import { YMDHiStoISODate, DateToUnixTimeStamp } from "../../core/utils/DateHelper.js";

const SEARCH_PHRASE_REGEX = /^([a-zA-Z0-9\s'".,]{0,40})[\s]+.*$/;

class NewItemStreamProcessing {
	constructor(settingsManager = null, enableChromeListener = true) {
		this.settingsManager = settingsManager || new SettingsMgr();
		this.dataStream = new Streamy();
		this.enableChromeListener = enableChromeListener;

		this.outputFunctions = {
			broadcast: () => {},
			push: () => {},
		};

		this.cachedSettings = {
			hideKeywords: null,
			highlightKeywords: null,
			blurKeywords: null,
			hideListEnabled: false,
			pushNotifications: false,
			pushNotificationsAFA: false,
		};

		this.setupPipeline();
		this.initialize();
	}

	async initialize() {
		await this.updateCachedSettings();

		if (this.enableChromeListener) {
			this.addSettingsListener();
		}
	}

	async updateCachedSettings() {
		await this.settingsManager.waitForLoad();

		this.cachedSettings.hideKeywords = this.settingsManager.get("general.hideKeywords");
		this.cachedSettings.highlightKeywords = this.settingsManager.get("general.highlightKeywords");
		this.cachedSettings.blurKeywords = this.settingsManager.get("general.blurKeywords");
		this.cachedSettings.hideListEnabled = this.settingsManager.get("notification.hideList");
		this.cachedSettings.pushNotifications = this.settingsManager.get("notification.pushNotifications");
		this.cachedSettings.pushNotificationsAFA = this.settingsManager.get("notification.pushNotificationsAFA");
	}

	addSettingsListener() {
		// Listen for settings changes to update handler
		if (typeof chrome === "undefined" || !chrome.storage) {
			throw new Error("chrome.storage is not defined");
		}
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace === "local") {
				// Check if any relevant settings changed
				const relevantKeys = [
					"general.hideKeywords",
					"general.highlightKeywords",
					"general.blurKeywords",
					"notification.hideList",
					"notification.pushNotifications",
					"notification.pushNotificationsAFA",
				];

				if (relevantKeys.some((key) => changes[key])) {
					// Update the handler's cached settings
					this.updateCachedSettings();
				}
			}
		});
	}

	//#####################################################
	//## PIPELINE
	//#####################################################

	filterHideItem(rawData) {
		if (!rawData.item) {
			return true; //Skip this filter
		}
		const data = rawData.item.data;
		if (data.title === undefined) {
			return true; //Skip this filter
		}
		//Only hide the keyword if the item is not a highlight match.
		if (this.cachedSettings.hideListEnabled && !data.KWsMatch) {
			// Check hide keywords with available ETV data (null/undefined values are handled by keywordMatch)
			const hideKWMatch = keywordMatch(this.cachedSettings.hideKeywords, data.title, data.etv_min, data.etv_max);
			if (hideKWMatch !== false) {
				return false; //Do not display the notification as it matches the hide list.
			}
		}
		return true;
	}

	transformIsHighlight(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;

		if (data.title === undefined) {
			return rawData; //Skip this transformer if no title
		}
		// Check highlight keywords with available ETV data (null/undefined values are handled by keywordMatch)
		const highlightKWMatch = keywordMatch(
			this.cachedSettings.highlightKeywords,
			data.title,
			data.etv_min,
			data.etv_max
		);
		rawData.item.data.KWsMatch = highlightKWMatch !== false;
		rawData.item.data.KW = highlightKWMatch;

		return rawData;
	}

	transformIsBlur(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		if (data.title == undefined) {
			return rawData; //Skip this transformer
		}
		const blurKWMatch = keywordMatch(this.cachedSettings.blurKeywords, data.title);
		rawData.item.data.BlurKWsMatch = blurKWMatch !== false;
		rawData.item.data.BlurKW = blurKWMatch;

		return rawData;
	}

	transformSearchPhrase(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		if (data.title == undefined) {
			return rawData; //Skip this transformer
		}

		//Method no longer useful.
		const search = data.title.replace(SEARCH_PHRASE_REGEX, "$1");
		rawData.item.data.search = search;
		return rawData;
	}

	transformUnixTimestamp(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		rawData.item.data.timestamp = this.dateToUnixTimestamp(data.date);
		return rawData;
	}

	transformPostNotification(rawData) {
		if (!rawData.item) {
			return rawData; //Skip this transformer
		}
		const data = rawData.item.data;
		if (data.asin == undefined) {
			return rawData; //Skip this transformer
		}

		//If the new item match a highlight keyword, push a real notification.
		const KWNotification = this.cachedSettings.pushNotifications && data.KWsMatch;
		const AFANotification = this.cachedSettings.pushNotificationsAFA && data.queue == "last_chance";

		if (KWNotification || AFANotification) {
			//Create a new clean item with just the info needed to display the notification
			const item = new Item({
				asin: data.asin,
				queue: data.queue,
				is_parent_asin: data.is_parent_asin,
				is_pre_release: data.is_pre_release,
				enrollment_guid: data.enrollment_guid,
			});
			item.setTitle(data.title);
			item.setImgUrl(data.img_url);
			item.setSearch(data.search);

			if (KWNotification) {
				this.outputFunctions.push("Vine Helper - New item match KW!", item);
			} else if (AFANotification) {
				this.outputFunctions.push("Vine Helper - New AFA item", item);
			}
		}
		return rawData;
	}

	setupPipeline() {
		const filterHideitem = this.dataStream.filter((rawData) => this.filterHideItem(rawData));
		const transformIsHighlight = this.dataStream.transformer((rawData) => this.transformIsHighlight(rawData));
		const transformIsBlur = this.dataStream.transformer((rawData) => this.transformIsBlur(rawData));
		const transformSearchPhrase = this.dataStream.transformer((rawData) => this.transformSearchPhrase(rawData));
		const transformUnixTimestamp = this.dataStream.transformer((rawData) => this.transformUnixTimestamp(rawData));
		const transformPostNotification = this.dataStream.transformer((rawData) =>
			this.transformPostNotification(rawData)
		);

		this.dataStream
			.pipe(transformIsHighlight) //Highlight keywords first...
			.pipe(filterHideitem) // ... then figure out if we can hide the item
			.pipe(transformIsBlur)
			.pipe(transformSearchPhrase)
			.pipe(transformUnixTimestamp)
			.pipe(transformPostNotification)
			.output((data) => {
				//Broadcast the notification
				this.outputFunctions.broadcast(data, "notification");
			});
	}

	dateToUnixTimestamp(dateString) {
		// Use the proper date parsing utilities instead of Safari-incompatible string concatenation
		const date = YMDHiStoISODate(dateString);
		return DateToUnixTimeStamp(date);
	}

	setBroadcastFunction(fct) {
		this.outputFunctions.broadcast = fct;
	}

	setNotificationPushFunction(fct) {
		this.outputFunctions.push = fct;
	}

	input(data) {
		this.dataStream.input(data);
	}

	// Expose settings for testing
	getCachedSettings() {
		return this.cachedSettings;
	}

	// Allow manual settings update for testing
	setCachedSettings(settings) {
		Object.assign(this.cachedSettings, settings);
	}
}

export { NewItemStreamProcessing };
