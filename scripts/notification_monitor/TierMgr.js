class TierMgr {
	#env = null;
	#goldTier = true;
	#etvLimit = null;

	constructor(env) {
		this.#env = env;
	}

	readTierInfo() {
		this.#goldTier = this.#env.getTierLevel("gold") === "gold";
		if (!this.#goldTier) {
			this.#etvLimit = this.#env.getSilverTierLimit();
		}
	}

	isGold() {
		return this.#goldTier;
	}

	getSilverTierETVLimit() {
		return this.#etvLimit;
	}
}

export { TierMgr };
