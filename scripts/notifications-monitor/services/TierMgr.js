import { Internationalization } from "/scripts/core/services/Internationalization.js";

class TierMgr {
	#env = null;
	#i13nMgr = null;
	#goldTier = true;
	#etvLimit = null;

	constructor(env) {
		this.#env = env;
		this.#i13nMgr = new Internationalization();
	}

	readTierInfo() {
		this.#goldTier = this.#env.getTierLevel("gold") === "gold";
		this.#etvLimit = this.#env.getSilverTierLimit();
	}

	isGold() {
		return this.#goldTier;
	}

	getTier() {
		return this.#goldTier ? "Gold" : "Silver";
	}

	getSilverTierETVLimit() {
		return this.#etvLimit;
	}

	getLimit() {
		if (this.#goldTier) {
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
