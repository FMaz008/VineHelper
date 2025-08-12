/**
 * Settings Manager with Dependency Injection
 *
 * This is a refactored version of SettingsMgr that:
 * - Uses dependency injection instead of singleton pattern
 * - Accepts a storage adapter for testability
 * - Maintains backward compatibility with existing API
 * - Can be gradually adopted throughout the codebase
 */

// Use relative import for better testability
import { Logger } from "../utils/Logger.js";

export class SettingsMgrDI {
	#storageAdapter;
	#logger;
	#defaultSettings;
	#settings;
	#isLoaded = false;
	#loadPromise;

	constructor(storageAdapter, logger = new Logger()) {
		this.#storageAdapter = storageAdapter;
		this.#logger = logger;
		this.#settings = {};
		this.#getDefaultSettings();

		// Initialize settings on construction
		this.#loadPromise = this.#initializeSettings();
	}

	async #initializeSettings() {
		try {
			await this.#loadSettingsFromStorage();
			this.#isLoaded = true;
			this.#logger.add("SettingsMgr: Settings loaded.");
			return true;
		} catch (error) {
			this.#logger.add(`SettingsMgr: Failed to load settings: ${error.message}`);
			throw error;
		}
	}

	// Return true if the user has a valid premium membership on Patreon
	isPremiumUser(tier = 2) {
		return parseInt(this.get("general.patreon.tier")) >= tier;
	}

	async waitForLoad() {
		return this.#loadPromise;
	}

	isLoaded() {
		return this.#isLoaded;
	}

	async refresh() {
		await this.#loadSettingsFromStorage();
	}

	get(settingPath, undefinedReturnDefault = true) {
		let answer = this.#getFromObject(this.#settings, settingPath);

		// If the value is not found in the settings, check if we should return the default value
		if (answer == undefined && undefinedReturnDefault) {
			answer = this.#getFromObject(this.#defaultSettings, settingPath);
		}

		return answer;
	}

	#getFromObject(obj, settingPath) {
		const pathArray = settingPath.split(".");
		return pathArray.reduce((prev, curr) => prev && prev[curr], obj);
	}

	async set(settingPath, value, reloadSettings = true) {
		// Don't go through the hassle of updating the value if it did not change
		if (this.get(settingPath, false) == value) {
			return false;
		}

		const pathArray = settingPath.split(".");
		const lastKey = pathArray.pop();

		// Traverse the object and create missing intermediate objects if needed
		let current = this.#settings;
		for (let key of pathArray) {
			if (!current[key]) {
				current[key] = {};
			}
			current = current[key];
		}

		// Set the final value
		current[lastKey] = value;

		await this.#save();

		// Reload settings if requested (but after saving!)
		if (reloadSettings) {
			await this.#loadSettingsFromStorage(true);
		}

		return true;
	}

	async #save() {
		try {
			await this.#storageAdapter.set("settings", this.#settings);
		} catch (e) {
			// Enhanced error handling for Safari and other browsers
			const isQuotaError =
				e.name === "QuotaExceededError" ||
				(e.message &&
					(e.message.includes("Exceeded storage quota") ||
						e.message.includes("QUOTA_BYTES quota exceeded") ||
						e.message.includes("quota exceeded")));

			if (isQuotaError) {
				this.#logger.add("SettingsMgr: Storage quota exceeded, attempting cleanup...");

				try {
					await this.#storageAdapter.set("hiddenItems", []);
					await this.#save();
				} catch (retryError) {
					this.#logger.add(`SettingsMgr: Storage quota cleanup failed: ${retryError.message}`);
					return false;
				}
			} else {
				// Some other error occurred - log it instead of showing alert
				this.#logger.add(`SettingsMgr: Storage error: ${e.name} - ${e.message}`);
				console.error("SettingsMgr storage error:", e);
				return false;
			}
		}
		return true;
	}

	async #loadSettingsFromStorage(skipMigration = false) {
		const settings = await this.#storageAdapter.get("settings");

		// If no settings exist already, create the default ones
		if (!settings || Object.keys(settings).length === 0) {
			// Will generate default settings
			await this.#storageAdapter.clear();
			this.#settings = { ...this.#defaultSettings };
			await this.#save();
		} else {
			this.#settings = { ...settings };
		}

		if (!skipMigration) {
			await this.#migrate();
		}
	}

	async #migrate() {
		// V3.1.0
		if (this.#settings.notification.monitor.tileSize == undefined) {
			this.#settings.notification.monitor.tileSize = this.#settings.tileSize;
			console.log("SettingsMgr: Migrated tileSize to notification.monitor.tileSize");
			await this.#save();
		}

		// V3.4.0
		if (this.get("general.deviceName", false) == undefined) {
			console.log("SettingsMgr: Migrated deviceName to general.deviceName");
			await this.set("general.blindLoading", false);
		}
		if (this.get("pinnedTab.remote", false) == undefined) {
			console.log("SettingsMgr: Migrated pinnedTab.remote to pinnedTab.remote");
			await this.set("pinnedTab.remote", this.get("hiddenTab.remote", false));
		}
		if (this.get("notification.monitor.sortType", false) == "date") {
			console.log("SettingsMgr: Migrated notification.monitor.sortType from 'date' to 'date_desc'");
			await this.set("notification.monitor.sortType", "date_desc");
		}

		// V3.5.0 - Remove compiled keywords (no longer needed)
		const generalSettings = this.#settings.general || {};
		let hasCompiledKeywords = false;

		// Check for any compiled keyword keys
		const compiledKeys = ["hideKeywords_compiled", "highlightKeywords_compiled", "blurKeywords_compiled"];
		for (const key of compiledKeys) {
			if (generalSettings[key] !== undefined) {
				delete generalSettings[key];
				hasCompiledKeywords = true;
			}
		}

		if (hasCompiledKeywords) {
			this.#logger.add("SettingsMgr: Removed legacy compiled keywords from storage");
			console.log("SettingsMgr: Removed legacy compiled keywords from storage");
			await this.#save();
		}
	}

	#getDefaultSettings() {
		this.#defaultSettings = {
			unavailableTab: {
				active: true,
			},

			general: {
				bookmark: false,
				bookmarkColor: "#90ee90",
				bookmarkDate: 0,
				blindLoading: false,
				blurKeywords: [],
				unblurImageOnHover: false,
				country: null,
				customCSS: "",
				detailsIcon: true,
				deviceName: null,
				discoveryFirst: true,
				displayETV: true,
				displayFirstSeen: true,
				displayFullTitleTooltip: false,
				displayModalETV: false,
				displayVariantIcon: false,
				displayVariantButton: false,
				fingerprint: null,
				forceTango: false, //if true, force isTangoEligible to false
				GDPRPopup: true,
				hiddenItemsCacheSize: 4,
				hideCategoriesRFYAFA: false,
				hideKeywords: [],
				hideNoNews: true,
				scrollToRFY: false,
				hideOptOutButton: false,
				hideRecommendations: false,
				hideSideCart: false,
				highlightColor: {
					active: true,
					color: "#FFE815",
					ignore0ETVhighlight: false,
					ignoreUnknownETVhighlight: false,
				},
				highlightKeywords: [],
				highlightKWFirst: true,
				listView: false,
				modalNavigation: false,
				searchOpenModal: false,
				patreon: {
					tier: 0,
				},
				projectedAccountStatistics: false,
				reviewToolbar: true,
				tileSize: {
					active: true,
					enabled: true,
					fontSize: 14,
					iconSize: 14,
					titleSpacing: 50,
					toolbarFontSize: 10,
					verticalSpacing: 20,
					width: 236,
				},
				topPagination: true,
				toolbarBackgroundColor: "#FFFFFF",
				skipPrimeAd: false,
				unknownETVHighlight: {
					active: false,
					color: "#FF3366",
				},
				uuid: null,
				verbosePagination: false,
				verbosePaginationStartPadding: 5,
				versionInfoPopup: 0,
				zeroETVHighlight: {
					active: true,
					color: "#64af4b",
				},
				debugTabTitle: false,
				debugPlaceholders: false,
				debugStackTraces: false,
				debugTitleDisplay: false,
				debugMemory: false,
				debugBulkOperations: false,
				debugMemoryAutoSnapshot: false,
				debugKeywords: false,
				debugSettings: false,
				debugStorage: false,
				debugVisibility: false,
				debugTileCounter: false,
				debugSound: false,
				debugDuplicates: false,
				debugItemProcessing: false,
				debugWebsocket: false,
				debugServercom: false,
				debugServiceWorker: false,
				debugCoordination: false,
			},
			metrics: {
				minutesUsed: 0,
			},
			notification: {
				active: false,
				hideList: true,
				autoload: {
					min: 2,
					max: 5,
					hourStart: "03:00",
					hourEnd: "17:00",
				},
				monitor: {
					"24hrsFormat": false,
					autoTruncate: true,
					autoTruncateLimit: 1000,
					mouseoverPause: false,
					pauseOverlay: false,
					bump0ETV: true,
					filterQueue: -1,
					filterType: -1,
					placeholders: true,
					highlight: {
						color: "#FFE815",
						colorActive: true,
						sound: "0",
						volume: 1,
						ignore0ETVhighlight: false,
						ignoreUnknownETVhighlight: false,
					},
					hideDuplicateThumbnail: false,
					hideGoldNotificationsForSilverUser: false,
					listView: false,
					openLinksInNewTab: "1",
					preventUnload: true,
					regular: {
						sound: "0",
						volume: 1,
					},
					sortType: "date_desc",
					tileSize: {
						fontSize: 14,
						iconSize: 14,
						titleSpacing: 50,
						toolbarFontSize: 10,
						verticalSpacing: 20,
						width: 236,
					},
					unknownETV: {
						color: "#FF3366",
						colorActive: false,
					},
					zeroETV: {
						color: "#64af4b",
						colorActive: true,
						sound: "0",
						volume: 1,
					},
				},
				pushNotifications: false,
				pushNotificationsAFA: false,
				reduce: false,
				screen: {
					active: false,
					regular: {
						sound: "0",
						volume: 1,
					},
					thumbnail: true,
				},
				soundCooldownDelay: 2000,
			},

			keyBindings: {
				active: true,
				AFAPage: "a",
				AIPage: "i",
				ALLPage: "l",
				debug: "d",
				hideAll: "h",
				nextPage: "n",
				pauseFeed: "f",
				previousPage: "p",
				RFYPage: "r",
				showAll: "s",
			},

			hiddenTab: {
				active: true,
				remote: false,
			},

			pinnedTab: {
				active: true,
				remote: false,
			},

			discord: {
				active: false,
				guid: null,
			},

			thorvarium: {
				categoriesWithEmojis: false,
				collapsableCategories: false,
				ETVModalOnTop: false,
				limitedQuantityIcon: false,
				mediumItems: true,
				mobileandroid: false,
				mobileios: false,
				moreDescriptionText: false,
				paginationOnTop: false,
				removeAssociateHeader: false,
				removeFooter: false,
				removeHeader: false,
				RFYAFAAITabs: false,
				smallItems: false,
				stripedCategories: false,
			},
		};
	}
}
