const STATE_WAITING = 1;
const STATE_COUNTING = 2;
const STATE_READY = 3;

import { HookMgr } from "/scripts/core/utils/HookMgr.js";

class TileCounter {
	#count = 0;
	#state = STATE_READY;
	#timeoutInstance = null;
	#hookMgr = null;

	constructor() {
		this.#hookMgr = new HookMgr();
	}

	/**
	 * Recount the number of tiles on the page
	 * @param {number} waitTime - The time to wait before recounting the tiles, in milliseconds
	 */
	recountVisibleTiles(waitTime = 50) {
		this.#state = STATE_WAITING;
		//Reset the interval
		window.clearTimeout(this.#timeoutInstance);

		//Create a new timeout
		if (waitTime === 0) {
			this.#startRecount();
		} else {
			this.#timeoutInstance = setTimeout(() => {
				this.#startRecount();
			}, waitTime);
		}
	}

	/**
	 * Start the recount timer
	 */
	#startRecount() {
		this.#state = STATE_COUNTING;

		//Calculate all the visible .vvp-item-tile elements of #vvp-items-grid
		const grid = document.querySelector("#vvp-items-grid");
		if (!grid) {
			throw new Error("Grid #vvp-items-grid not found");
		}

		//For each tile, get the style.display property and count them if they are not "none"
		const tiles = grid.querySelectorAll(".vvp-item-tile:not(.vh-placeholder-tile)");
		let count = 0;
		for (const tile of tiles) {
			if (window.getComputedStyle(tile).display !== "none") {
				count++;
			}
		}

		//Update the count
		this.#count = count;
		this.#state = STATE_READY;

		this.#hookMgr.hookExecute("visibility:count-changed", { count: this.#count });
	}

	/**
	 * Get the current count
	 * @returns {number} The current count
	 */
	getCount() {
		return this.#count;
	}

	/**
	 * Wait until the recount is complete
	 * @returns {Promise<void>} Promise that resolves when the recount is complete
	 */
	waitUntilCountComplete() {
		return new Promise((resolve, reject) => {
			const checkCount = () => {
				if (this.#state === STATE_READY) {
					resolve();
				} else {
					setTimeout(checkCount, 10);
				}
			};
			checkCount();
		});
	}
}

export { TileCounter };
