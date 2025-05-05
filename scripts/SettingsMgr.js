import { Logger } from "./Logger.js";
var logger = new Logger();

class SettingsMgr {
	static #instance = null;
	#defaultSettings;
	#settings;

	#isLoaded = false;
	#loadPromise;

	constructor() {
		if (SettingsMgr.#instance) {
			// Return the existing instance if it already exists
			return SettingsMgr.#instance;
		}
		// Initialize the instance if it doesn't exist
		SettingsMgr.#instance = this;

		logger.add("SettingsMgr: Initializing settings...");

		this.#settings = {};
		this.#getDefaultSettings();

		//Implicit promise created
		this.#loadPromise = this.#initializeSettings();
	}

	async #initializeSettings() {
		try {
			await this.#loadSettingsFromStorage();

			this.#isLoaded = true;
			logger.add("SettingsMgr: Settings loaded.");
			return true;
		} catch (error) {
			console.error("Failed to load settings:", error);
			throw error;
		}
	}

	//Return true if the user has a valid premium membership on Patreon
	isPremiumUser(tier = 2) {
		return parseInt(this.get("general.patreon.tier")) >= tier;
	}

	// Replace the old isLoaded() method
	async waitForLoad() {
		return this.#loadPromise;
	}

	// Keep the sync check if needed, but prefer waitForLoad()
	isLoaded() {
		return this.#isLoaded;
	}

	async refresh() {
		await this.#loadSettingsFromStorage();
	}

	get(settingPath, undefinedReturnDefault = true) {
		let answer = this.#getFromObject(this.#settings, settingPath);

		//If the value is not found in the settings, check if we should return the default value.
		if (answer == undefined && undefinedReturnDefault) {
			answer = this.#getFromObject(this.#defaultSettings, settingPath);
		}

		return answer;
	}

	#getFromObject(obj, settingPath) {
		// Split the path by dots to access each level of the object
		const pathArray = settingPath.split(".");

		// Use reduce to iterate over the array and go deeper into the object
		return pathArray.reduce((prev, curr) => prev && prev[curr], obj);
	}

	async set(settingPath, value, reloadSettings = true) {
		//Don't go through the hassle of updating the value if it did not change
		if (this.get(settingPath, false) == value) {
			return false; //No value updated
		}

		if (reloadSettings) {
			await this.#loadSettingsFromStorage(true);
		}

		const pathArray = settingPath.split(".");
		const lastKey = pathArray.pop();

		// Traverse the object and create missing intermediate objects if needed
		let current = this.#settings;
		for (let key of pathArray) {
			if (!current[key]) {
				current[key] = {}; // Create the object if it doesn't exist
			}
			current = current[key];
		}

		// Set the final value
		current[lastKey] = value;

		await this.#save();
		return true;
	}

	async #save() {
		try {
			chrome.storage.local.set({ settings: this.#settings });
		} catch (e) {
			if (e.name === "QuotaExceededError") {
				// The local storage space has been exceeded
				alert("Local storage quota exceeded! Hidden items will be cleared to make space.");
				await chrome.storage.local.set({ hiddenItems: [] });
				this.#save();
			} else {
				// Some other error occurred
				alert("Error:", e.name, e.message);
				return false;
			}
		}
	}

	async #loadSettingsFromStorage(skipMigration = false) {
		const data = await chrome.storage.local.get("settings");

		//If no settings exist already, create the default ones
		if (data == null || Object.keys(data).length === 0) {
			//Will generate default settings
			await chrome.storage.local.clear(); //Delete all local storage
			this.#settings = this.#defaultSettings;
			await this.#save();
		} else {
			Object.assign(this.#settings, data.settings);
		}
		if (!skipMigration) {
			await this.#migrate();
		}
	}

	async #migrate() {
		//V2.2.0: Move the keybinding settings
		if (this.#settings.general.keyBindings !== undefined) {
			this.#settings.keyBindings = {};
			this.#settings.keyBindings.active = this.#settings.general.keyBindings;
			this.#settings.keyBindings.nextPage = "n";
			this.#settings.keyBindings.previousPage = "p";
			this.#settings.keyBindings.RFYPage = "r";
			this.#settings.keyBindings.AFAPage = "a";
			this.#settings.keyBindings.AIPage = "i";
			this.#settings.keyBindings.hideAll = "h";
			this.#settings.keyBindings.showAll = "s";
			this.#settings.keyBindings.debug = "d";
			this.#settings.general.keyBindings = undefined;
			await this.#save();
		}

		//V2.2.3: Configure garbage collector for hidden items
		if (this.#settings.general.hiddenItemsCacheSize == undefined) {
			this.#settings.general.hiddenItemsCacheSize = 9;
			await this.#save();
		}
		if (this.#settings.general.newItemNotificationImage == undefined) {
			this.#settings.general.newItemNotificationImage = true;
			await this.#save();
		}

		//v2.2.7
		if (this.#settings.general.displayNewItemNotifications == undefined) {
			this.#settings.general.displayNewItemNotifications = this.#settings.general.newItemNotification;
			await this.#save();
		}

		//v2.3.3
		if (this.#settings.general.hideKeywords == undefined) {
			this.#settings.general.hideKeywords = [];
			await this.#save();
		}
		if (this.#settings.general.highlightKeywords == undefined) {
			this.#settings.general.highlightKeywords = [];
			await this.#save();
		}

		//v2.7.6
		if (this.#settings.notification == undefined) {
			console.log("Updating settings...");
			//Convert the old settings to the new format
			this.#settings.notification = {
				active: this.#settings.general.newItemNotification,
				reduce: this.#settings.general.reduceNotifications,
				screen: {
					active: this.#settings.general.displayNewItemNotifications,
					thumbnail: this.#settings.general.newItemNotificationImage,
					regular: {
						sound: "0",
						volume: 0,
					},
				},
				monitor: {
					hideList: this.#settings.general.newItemMonitorNotificationHiding,
					hideDuplicateThumbnail: this.#settings.general.newItemMonitorDuplicateImageHiding,
					regular: {
						sound: "notification",
						volume: this.#settings.general.newItemMonitorNotificationSound == 2 ? 0 : 1,
					},
					highlight: {
						sound: "notification",
						volume: 1,
						color: "#FFE815",
					},
					zeroETV: {
						sound: "0",
						volume: 1,
						color: "#64af4b",
					},
				},
			};
			this.#settings.customCSS = "";
			delete this.#settings.general.newItemNotification;
			delete this.#settings.general.displayNewItemNotifications;
			delete this.#settings.general.newItemNotificationImage;
			delete this.#settings.general.newItemMonitorNotificationHiding;
			delete this.#settings.general.newItemMonitorDuplicateImageHiding;
			delete this.#settings.general.newItemMonitorNotificationSound;
			delete this.#settings.general.reduceNotifications;
			delete this.#settings.general.newItemNotificationVolume;
			delete this.#settings.general.newItemNotificationSound;
			delete this.#settings.general.newItemMonitorNotificationVolume;
			delete this.#settings.general.newItemMonitorNotificationSoundCondition;

			delete this.#settings.general.firstVotePopup;
			delete this.#settings.unavailableTab.consensusDiscard;
			delete this.#settings.unavailableTab.selfDiscard;
			delete this.#settings.unavailableTab.unavailableOpacity;
			delete this.#settings.unavailableTab.votingToolbar;
			delete this.#settings.unavailableTab.consensusThreshold;

			await this.#save();
		}

		//V3.1.0
		if (this.#settings.notification.monitor.tileSize == undefined) {
			this.#settings.notification.monitor.tileSize = this.#settings.tileSize;
			await this.#save();
		}
	}

	#getDefaultSettings() {
		this.#defaultSettings = {
			unavailableTab: {
				active: true,
			},

			general: {
				country: null,
				uuid: null,
				topPagination: true,
				verbosePagination: false,
				verbosePaginationStartPadding: 5,
				displayFirstSeen: true,
				displayETV: true,
				displayModalETV: false,
				bookmark: false, //Highlight recently added items
				bookmarkDate: 0,
				bookmarkColor: "#90ee90",
				hideKeywords: [],
				highlightKeywords: [],
				blurKeywords: [],
				blindLoading: false,
				displayVariantIcon: false,
				displayFullTitleTooltip: false,
				versionInfoPopup: 0,
				GDPRPopup: true,
				highlightKWFirst: true,
				discoveryFirst: true,
				hiddenItemsCacheSize: 4,
				customCSS: "",
				modalNavigation: false,
				listView: false,
				reviewToolbar: true,
				projectedAccountStatistics: false,
				hideRecommendations: false,
				hideSideCart: false,
				hideCategoriesRFYAFA: false,
				hideOptOutButton: false,
				toolbarBackgroundColor: "#FFFFFF",
				highlightColor: {
					active: true,
					color: "#FFE815",
				},
				zeroETVHighlight: {
					active: true,
					color: "#64af4b",
				},
				unknownETVHighlight: {
					active: false,
					color: "#FF3366",
				},
				tileSize: {
					enabled: true, //Will apply the changes to the tile size as configured
					active: true, //Will show the widget with sliders to adjust the size of various element in listings
					width: 236,
					iconSize: 14,
					verticalSpacing: 20,
					titleSpacing: 50,
					fontSize: 14,
					toolbarFontSize: 10,
				},
				hideNoNews: true,
				patreon: {
					tier: 0,
				},
			},
			metrics: {
				minutesUsed: 0,
			},
			notification: {
				active: false,
				reduce: false,
				pushNotifications: false,
				soundCooldownDelay: 2000,
				hideList: true,
				screen: {
					active: false,
					thumbnail: true,
					regular: {
						sound: "0",
						volume: 1,
					},
				},
				monitor: {
					preventUnload: true,
					hideDuplicateThumbnail: false,
					blockNonEssentialListeners: false,
					listView: false,
					"24hrsFormat": false,
					openLinksInNewTab: "1",
					autoTruncate: true,
					hideGoldNotificationsForSilverUser: false,
					filterQueue: -1,
					filterType: -1,
					bump0ETV: true,
					sortType: "date",
					regular: {
						sound: "0",
						volume: 1,
					},
					highlight: {
						sound: "0",
						volume: 1,
						colorActive: true,
						color: "#FFE815",
					},
					zeroETV: {
						sound: "0",
						volume: 1,
						colorActive: true,
						color: "#64af4b",
					},
					unknownETV: {
						colorActive: false,
						color: "#FF3366",
					},
					tileSize: {
						width: 236,
						iconSize: 14,
						verticalSpacing: 20,
						titleSpacing: 50,
						fontSize: 14,
						toolbarFontSize: 10,
					},
					autoTruncateLimit: 1000,
				},
			},

			keyBindings: {
				active: true,
				pauseFeed: "f",
				nextPage: "n",
				previousPage: "p",
				RFYPage: "r",
				AFAPage: "a",
				AIPage: "i",
				hideAll: "h",
				showAll: "s",
				debug: "d",
			},

			hiddenTab: {
				active: true,
				remote: false,
			},

			pinnedTab: {
				active: true,
			},

			discord: {
				active: false,
				guid: null,
			},

			thorvarium: {
				mobileios: false,
				mobileandroid: false,
				smallItems: false,
				mediumItems: true,
				removeHeader: false,
				removeFooter: false,
				removeAssociateHeader: false,
				moreDescriptionText: false,
				ETVModalOnTop: false,
				categoriesWithEmojis: false,
				paginationOnTop: false,
				collapsableCategories: false,
				stripedCategories: false,
				limitedQuantityIcon: false,
				RFYAFAAITabs: false,
			},
		};
	}
}

export { SettingsMgr };
