/**
 * SettingsMgr Compatibility Layer
 *
 * This file provides a drop-in replacement for the existing SettingsMgr
 * that uses the new DI-based implementation under the hood.
 *
 * To migrate:
 * 1. Replace: import { SettingsMgr } from "./SettingsMgr.js"
 * 2. With:import { SettingsMgr } from "./SettingsMgrCompat.js"
 */

import { getSettingsManager } from "/scripts/infrastructure/SettingsFactory.js";

// Create a singleton-like class that delegates to the DI instance
class SettingsMgr {
	static #instance = null;
	#diInstance = null;

	constructor() {
		if (SettingsMgr.#instance) {
			return SettingsMgr.#instance;
		}

		SettingsMgr.#instance = this;
		this.#diInstance = getSettingsManager();
	}

	// Delegate all methods to the DI instance
	isPremiumUser(tier = 2) {
		return this.#diInstance.isPremiumUser(tier);
	}

	async waitForLoad() {
		return this.#diInstance.waitForLoad();
	}

	isLoaded() {
		return this.#diInstance.isLoaded();
	}

	async refresh() {
		return this.#diInstance.refresh();
	}

	get(settingPath, undefinedReturnDefault = true) {
		return this.#diInstance.get(settingPath, undefinedReturnDefault);
	}

	async set(settingPath, value, reloadSettings = true) {
		return this.#diInstance.set(settingPath, value, reloadSettings);
	}
}

export { SettingsMgr };
