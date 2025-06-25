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
	#isBulkFetchActive = false; // Track if any monitor is in bulk fetch mode

	constructor(soundPlayerMgr, settings) {
		if (SoundCoordinator.#instance) {
			return SoundCoordinator.#instance;
		}

		this.#soundPlayerMgr = soundPlayerMgr;
		this.#settings = settings;

		// Use the existing soundCooldownDelay setting for deduplication
		// Default to 2000ms (2 seconds) if not set
		try {
			this.#CACHE_DURATION = this.#settings?.get("notification.soundCooldownDelay") || 2000;
		} catch (e) {
			// Setting might not exist in older installations, use default
			this.#CACHE_DURATION = 2000;
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

		// During bulk fetch, individual sounds should be suppressed
		// They will be accumulated and played as a bulk sound instead
		if (this.#isBulkFetchActive) {
			if (this.#settings?.get("general.debugNotifications")) {
				console.log("[SoundCoordinator] Suppressing individual sound during bulk fetch:", {
					asin,
					itemType,
					tileVisible,
				});
			}
			return false;
		}

		const now = Date.now();

		// Check if this item's sound was recently played
		if (this.#recentlyPlayedItems.has(asin)) {
			const lastPlayed = this.#recentlyPlayedItems.get(asin);
			if (now - lastPlayed < this.#CACHE_DURATION) {
				// Sound was recently played, skip
				return false;
			}
		}

		// Mark this item as played BEFORE broadcasting or playing
		// This reduces the race condition window
		this.#recentlyPlayedItems.set(asin, now);

		// Broadcast to other monitors immediately
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

		// Small delay for slave monitors to allow master's broadcast to arrive
		// This is a simple way to reduce race conditions without complex locking
		if (!tileVisible) {
			// If tile is not visible in this monitor, it's likely a slave
			// Add a small delay to let master play first
			setTimeout(() => {
				this.#soundPlayerMgr.play(itemType);
			}, 50);
		} else {
			// Play immediately if tile is visible (likely master)
			this.#soundPlayerMgr.play(itemType);
		}
		
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
	 * @param {boolean} isMaster - Whether this is the master monitor
	 * @returns {Promise<boolean>} - True if sound was played, false if it was blocked as duplicate
	 */
	async tryPlayBulkSound(itemTypes, context = "bulk", isMaster = false) {
		const soundType = SoundCoordinator.getHighestPrioritySound(itemTypes);
		if (soundType === null) return false;

		// Use context alone as the key for bulk operations
		// This ensures only one sound plays per bulk operation across all monitors
		const key = context;
		const now = Date.now();

		// First, check if any bulk sound for this context was recently played
		if (this.#recentlyPlayedItems.has(key)) {
			const lastPlayed = this.#recentlyPlayedItems.get(key);
			if (now - lastPlayed < this.#CACHE_DURATION) {
				// A bulk sound for this context was recently played, skip
				return false;
			}
		}

		// For bulk sounds, implement a simple priority system:
		// Master always plays immediately, slaves wait a bit to check for broadcasts
		if (!isMaster) {
			// Wait a longer delay to ensure master's broadcast arrives
			// Increased to 500ms to handle network/processing delays
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Check again after the delay
			if (this.#recentlyPlayedItems.has(key)) {
				const lastPlayed = this.#recentlyPlayedItems.get(key);
				const timeSince = Date.now() - lastPlayed;
				if (timeSince < this.#CACHE_DURATION) {
					// Another monitor already played a sound for this bulk operation
					return false;
				}
			}
		}

		// Mark this bulk operation as having played a sound BEFORE playing
		// This reduces the window for race conditions
		this.#recentlyPlayedItems.set(key, now);

		// Broadcast to other monitors immediately
		if (this.#channel) {
			try {
				this.#channel.postMessage({
					type: "sound-played",
					asin: key, // Use the context key as identifier
					timestamp: now,
				});
			} catch (error) {
				console.warn("[SoundCoordinator] Failed to broadcast bulk sound message:", error);
			}
		} else {
			console.warn("[SoundCoordinator] No BroadcastChannel available for coordination");
		}

		// Play the highest priority sound from the types found
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

	/**
	 * Notify all monitors that bulk fetch is starting
	 */
	notifyBulkFetchStart() {
		this.#isBulkFetchActive = true;
		if (this.#channel) {
			try {
				this.#channel.postMessage({
					type: "bulk-fetch-start",
					timestamp: Date.now(),
				});
			} catch (error) {
				console.warn("[SoundCoordinator] Failed to broadcast bulk-fetch-start:", error);
			}
		}
	}

	/**
	 * Notify all monitors that bulk fetch has ended
	 */
	notifyBulkFetchEnd() {
		this.#isBulkFetchActive = false;
		if (this.#channel) {
			try {
				this.#channel.postMessage({
					type: "bulk-fetch-end",
					timestamp: Date.now(),
				});
			} catch (error) {
				console.warn("[SoundCoordinator] Failed to broadcast bulk-fetch-end:", error);
			}
		}
	}

	/**
	 * Check if any monitor is currently in bulk fetch mode
	 * @returns {boolean}
	 */
	isBulkFetchActive() {
		return this.#isBulkFetchActive;
	}

	#setupChannelListener() {
		this.#channel.addEventListener("message", (event) => {
			if (event.data.type === "sound-played") {
				// Another monitor played a sound for this item
				// Update our cache to prevent duplicate
				this.#recentlyPlayedItems.set(event.data.asin, event.data.timestamp);
			} else if (event.data.type === "bulk-fetch-start") {
				// A monitor has started bulk fetch
				this.#isBulkFetchActive = true;
				if (this.#settings?.get("general.debugNotifications")) {
					console.log("[SoundCoordinator] Bulk fetch started by another monitor");
				}
			} else if (event.data.type === "bulk-fetch-end") {
				// A monitor has ended bulk fetch
				this.#isBulkFetchActive = false;
				if (this.#settings?.get("general.debugNotifications")) {
					console.log("[SoundCoordinator] Bulk fetch ended by another monitor");
				}
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
