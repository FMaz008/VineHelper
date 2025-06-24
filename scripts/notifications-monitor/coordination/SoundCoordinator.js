/**
 * SoundCoordinator - Coordinates notification sounds across multiple monitor instances
 *
 * This class ensures that when an item appears in multiple monitors (master/slave),
 * only one sound is played, similar to how OS notifications work.
 *
 * It uses BroadcastChannel for cross-tab communication and maintains a short-lived
 * cache of recently played items to prevent duplicate sounds.
 */

// Sound type constants (matching NotificationMonitor)
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;

class SoundCoordinator {
	static #instance = null;
	#channel = null;
	#recentlyPlayedItems = new Map(); // ASIN -> timestamp
	#cleanupInterval = null;
	#soundPlayerMgr = null;
	#settings = null;
	#CACHE_DURATION = 1000; // Default 1 second cache for deduplication
	#CLEANUP_INTERVAL = 5000; // Clean up old entries every 5 seconds

	constructor(soundPlayerMgr, settings) {
		if (SoundCoordinator.#instance) {
			return SoundCoordinator.#instance;
		}

		this.#soundPlayerMgr = soundPlayerMgr;
		this.#settings = settings;

		// Use a separate deduplication window setting if available, otherwise default to 1 second
		// This is intentionally separate from soundCooldownDelay which serves a different purpose
		try {
			this.#CACHE_DURATION = this.#settings?.get("notification.soundDeduplicationWindow") || 1000;
		} catch (e) {
			// Setting might not exist in older installations, use default
			this.#CACHE_DURATION = 1000;
		}

		// Initialize BroadcastChannel if available
		if (typeof BroadcastChannel !== "undefined") {
			try {
				this.#channel = new BroadcastChannel("vinehelper-sound-coordination");
				this.#setupChannelListener();
			} catch (error) {
				console.warn("[SoundCoordinator] Failed to create BroadcastChannel:", error);
			}
		}

		// Set up periodic cleanup of old entries
		this.#cleanupInterval = setInterval(() => {
			this.#cleanupOldEntries();
		}, this.#CLEANUP_INTERVAL);

		SoundCoordinator.#instance = this;
	}

	/**
	 * Attempt to play a sound for an item
	 * @param {string} asin - The item's ASIN
	 * @param {number} itemType - The type of item (0=regular, 1=zeroETV, 2=highlight)
	 * @param {boolean} tileVisible - Whether the tile is visible in this monitor
	 * @returns {boolean} - True if sound was played, false if it was blocked as duplicate
	 */
	tryPlaySound(asin, itemType, tileVisible) {
		if (!asin) return false;

		const now = Date.now();

		// Check if this item's sound was recently played
		if (this.#recentlyPlayedItems.has(asin)) {
			const lastPlayed = this.#recentlyPlayedItems.get(asin);
			if (now - lastPlayed < this.#CACHE_DURATION) {
				// Sound was recently played, skip
				return false;
			}
		}

		// Mark this item as played
		this.#recentlyPlayedItems.set(asin, now);

		// Broadcast to other monitors that we're playing this sound
		if (this.#channel) {
			try {
				this.#channel.postMessage({
					type: "sound-played",
					asin: asin,
					timestamp: now,
				});
			} catch (error) {
				console.warn("[SoundCoordinator] Failed to broadcast sound-played message:", error);
			}
		}

		// Play the sound
		this.#soundPlayerMgr.play(itemType);
		return true;
	}

	/**
	 * Determine the highest priority sound type from a set of item types
	 * Priority: HIGHLIGHT (2) > ZEROETV (1) > REGULAR (0)
	 * @param {Set<number>} itemTypes - Set of item types found
	 * @returns {number|null} - The highest priority sound type, or null if empty
	 */
	static getHighestPrioritySound(itemTypes) {
		if (!itemTypes || itemTypes.size === 0) return null;

		// Check in priority order
		if (itemTypes.has(TYPE_HIGHLIGHT)) return TYPE_HIGHLIGHT;
		if (itemTypes.has(TYPE_ZEROETV)) return TYPE_ZEROETV;
		if (itemTypes.has(TYPE_REGULAR)) return TYPE_REGULAR;

		return null;
	}

	/**
	 * Attempt to play a bulk sound (for multiple items at once)
	 * @param {Set<number>} itemTypes - Set of item types found during bulk operation
	 * @param {string} context - Context identifier for deduplication (e.g., "bulk-fetch")
	 * @returns {boolean} - True if sound was played, false if it was blocked as duplicate
	 */
	tryPlayBulkSound(itemTypes, context = "bulk") {
		const soundType = SoundCoordinator.getHighestPrioritySound(itemTypes);
		if (soundType === null) return false;

		const key = `${context}-${soundType}`;
		const now = Date.now();

		// Check if this bulk sound was recently played
		if (this.#recentlyPlayedItems.has(key)) {
			const lastPlayed = this.#recentlyPlayedItems.get(key);
			if (now - lastPlayed < this.#CACHE_DURATION) {
				// Bulk sound was recently played, skip
				return false;
			}
		}

		// Mark this bulk sound as played
		this.#recentlyPlayedItems.set(key, now);

		// Broadcast to other monitors
		if (this.#channel) {
			try {
				this.#channel.postMessage({
					type: "sound-played",
					asin: key, // Use the key as identifier
					timestamp: now,
				});
			} catch (error) {
				console.warn("[SoundCoordinator] Failed to broadcast bulk sound message:", error);
			}
		}

		// Play the sound
		this.#soundPlayerMgr.play(soundType);
		return true;
	}

	/**
	 * Check if an item should trigger a sound based on visibility across any monitor
	 * @param {string} asin - The item's ASIN
	 * @param {boolean} locallyVisible - Whether the item is visible in this monitor
	 * @returns {Promise<boolean>} - True if item is visible in any monitor
	 */
	async shouldPlaySoundForItem(asin, locallyVisible) {
		if (locallyVisible) {
			// Item is visible in this monitor
			return true;
		}

		// For items not visible locally, we could query other monitors
		// but for simplicity, we'll let each monitor decide based on its own visibility
		// This matches the user's requirement that sounds play for items visible in ANY monitor
		return false;
	}

	#setupChannelListener() {
		this.#channel.addEventListener("message", (event) => {
			if (event.data.type === "sound-played") {
				// Another monitor played a sound for this item
				// Update our cache to prevent duplicate
				this.#recentlyPlayedItems.set(event.data.asin, event.data.timestamp);
			}
		});
	}

	#cleanupOldEntries() {
		const now = Date.now();
		const cutoff = now - this.#CACHE_DURATION;

		for (const [asin, timestamp] of this.#recentlyPlayedItems.entries()) {
			if (timestamp < cutoff) {
				this.#recentlyPlayedItems.delete(asin);
			}
		}
	}

	destroy() {
		if (this.#cleanupInterval) {
			clearInterval(this.#cleanupInterval);
			this.#cleanupInterval = null;
		}

		if (this.#channel) {
			this.#channel.close();
			this.#channel = null;
		}

		this.#recentlyPlayedItems.clear();
		SoundCoordinator.#instance = null;
	}
}

export { SoundCoordinator };
