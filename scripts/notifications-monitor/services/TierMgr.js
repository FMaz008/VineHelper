import { Internationalization } from "/scripts/core/services/Internationalization.js";

class TierMgr {
	#env = null;
	#i13nMgr = null;
	#goldTier = true;
	#etvLimit = null;
	#settings = null;
	#debugOverrideLogged = false;

	constructor(env, settings = null) {
		this.#env = env;
		this.#i13nMgr = new Internationalization();
		this.#settings = settings;
	}

	readTierInfo() {
		this.#goldTier = this.#env.getTierLevel("gold") === "gold";
		this.#etvLimit = this.#env.getSilverTierLimit();

		// Log debug override status once when tier info is read
		if (this.#settings && this.#settings.get("general.debugOverrideTierToGold") && !this.#debugOverrideLogged) {
			console.log("[TierMgr] Debug override active - treating Silver tier as Gold tier for testing");
			this.#debugOverrideLogged = true;
		}
	}

	isGold() {
		// Check for debug override first
		if (this.#settings && this.#settings.get("general.debugOverrideTierToGold")) {
			return true;
		}
		return this.#goldTier;
	}

	getTier() {
		// Check for debug override first
		if (this.#settings && this.#settings.get("general.debugOverrideTierToGold")) {
			return "Gold (Debug Override)";
		}
		return this.#goldTier ? "Gold" : "Silver";
	}

	getSilverTierETVLimit() {
		return this.#etvLimit;
	}

	getLimit() {
		// Check for debug override or actual gold tier
		if (this.isGold()) {
			return "&infin;";
		}
		// Format the ETV limit as local currency
		return new Intl.NumberFormat(this.#i13nMgr.getLocale(), {
			style: "currency",
			currency: this.#i13nMgr.getCurrency(),
		}).format(this.#etvLimit);
	}
}

export { TierMgr };
