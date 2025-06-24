import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";

const Settings = new SettingsMgr();

const STATE_READY = 0;
const STATE_WAIT = 1;
const STATE_PLAY = 2;
const STATE_COOLDOWN = 3;
class NotificationsSoundPlayer {
	#state;
	#waitTimer;
	#cooldownTimer;
	#waitDelay;
	#cooldownDelay;
	#notificationType;
	#debugNotifications;

	constructor() {
		this.#state = STATE_READY;
		this.#waitDelay = 250;
		this.#notificationType = -1; //-1 = no sound to play
		this.#cooldownTimer = null;
		this.#debugNotifications = Settings.get("general.debugNotifications");
		this.#loadSettings();

		//Wait until the computer is awaken from sleep
		window.addEventListener("pageshow", (event) => {
			if (event.persisted) {
				this.#state = STATE_COOLDOWN;
				// Clear any existing timers to prevent stuck states
				this.#clearTimers();
				this.#cooldownTimer = setTimeout(() => {
					this.#state = STATE_READY;
					this.#cooldownTimer = null;
				}, 5000);
			}
		});
	}
	async #loadSettings() {
		while (!Settings || !Settings.isLoaded()) {
			await new Promise((r) => setTimeout(r, 10));
		}
		this.#cooldownDelay = Settings.get("notification.soundCooldownDelay");
	}

	play(notificationType) {
		// Check if we're in a master monitor
		const isMasterMonitor = window._notificationMonitor?._isMasterMonitor;
		
		if (this.#debugNotifications) {
			console.log("[NotificationsSoundPlayer] Play requested:", {
				notificationType: notificationType,
				currentState: this.#state,
				stateNames: {0: "READY", 1: "WAIT", 2: "PLAY", 3: "COOLDOWN"},
				currentNotificationType: this.#notificationType,
				cooldownDelay: this.#cooldownDelay,
				isMasterMonitor: isMasterMonitor,
				monitorId: window._notificationMonitor?._monitorId,
				stackTrace: new Error().stack
			});
		}
		
		// ISSUE #1 FIX: Only allow master monitor to play sounds
		// Check if we're explicitly a slave monitor (false means slave, undefined means not initialized yet)
		if (isMasterMonitor === false) {
			if (this.#debugNotifications) {
				console.warn("[NotificationsSoundPlayer] BLOCKED: Slave monitor attempted to play sound", {
					notificationType,
					monitorId: window._notificationMonitor?._monitorId
				});
			}
			return; // Don't play sounds in slave monitors
		}
		
		// Also block if master/slave status is not yet determined (undefined)
		// This prevents race conditions during initialization
		if (isMasterMonitor === undefined && window._notificationMonitor) {
			if (this.#debugNotifications) {
				console.log("[NotificationsSoundPlayer] DEFERRED: Master/slave status not yet determined", {
					notificationType,
					monitorId: window._notificationMonitor?._monitorId
				});
			}
			return;
		}
		
		//Save the highest notification type
		this.#setHighestNotificationType(notificationType);

		//Play logic
		if (this.#state === STATE_READY) {
			this.#setState(STATE_WAIT);
			window.clearTimeout(this.#waitTimer);
			this.#waitTimer = window.setTimeout(() => {
				this.#waitTimer = null;
				this.#playSound();
			}, this.#waitDelay);
		} else if (this.#state === STATE_WAIT) {
			// Already waiting, just update the notification type
			if (this.#debugNotifications) {
				console.log("[NotificationsSoundPlayer] Already in WAIT state, notification type updated");
			}
		} else {
			if (this.#debugNotifications) {
				console.log("[NotificationsSoundPlayer] Sound blocked - in", this.#state === STATE_PLAY ? "PLAY" : "COOLDOWN", "state");
			}
		}
	}

	#clearTimers() {
		if (this.#waitTimer) {
			window.clearTimeout(this.#waitTimer);
			this.#waitTimer = null;
		}
		if (this.#cooldownTimer) {
			window.clearTimeout(this.#cooldownTimer);
			this.#cooldownTimer = null;
		}
	}

	#setState(stateType) {
		const oldState = this.#state;
		this.#state = stateType;
		if (this.#debugNotifications) {
			const stateNames = {0: "READY", 1: "WAIT", 2: "PLAY", 3: "COOLDOWN"};
			console.log("[NotificationsSoundPlayer] State change:", {
				from: stateNames[oldState],
				to: stateNames[stateType]
			});
		}
	}
	#setHighestNotificationType(notificationType) {
		if (notificationType >= this.#notificationType) {
			this.#notificationType = notificationType;
		}
	}

	#playSound() {
		// Ensure we're in a valid state to play
		if (this.#state !== STATE_WAIT && this.#state !== STATE_READY) {
			console.error("[NotificationsSoundPlayer] Invalid state for playSound:", this.#state);
			this.#setState(STATE_READY);
			return false;
		}

		this.#setState(STATE_PLAY);

		let data = this.#getSoundAccordingToNotificationType(this.#notificationType);
		if (this.#debugNotifications) {
			console.log("[NotificationsSoundPlayer] Playing sound:", {
				notificationType: this.#notificationType,
				soundData: data,
				cooldownDelay: this.#cooldownDelay
			});
		}
		
		if (data == null) {
			if (this.#debugNotifications) {
				console.log("[NotificationsSoundPlayer] No sound data - skipping playback");
			}
			this.#notificationType = -1;
			this.#setState(STATE_READY);
			return false; // don't play any sound.
		}
		let filename = data.filename;
		let volume = data.volume;

		const audioElement = new Audio(chrome.runtime.getURL("resource/sound/" + filename + ".mp3"));
		const handleEnded = () => {
			audioElement.removeEventListener("ended", handleEnded); // Remove the event listener
			audioElement.remove(); // Remove the audio element from the DOM
		};
		audioElement.addEventListener("ended", handleEnded);
		if (volume >= 0 && volume <= 1) {
			audioElement.volume = Number(volume);
		}

		// Store the notification type that was played
		const playedNotificationType = this.#notificationType;
		this.#notificationType = -1;

		audioElement.play()
			.then(() => {
				// Successfully played, start cooldown
				this.#setState(STATE_COOLDOWN);
				if (this.#debugNotifications) {
					console.log(`[NotificationsSoundPlayer] Starting cooldown for ${this.#cooldownDelay}ms`);
				}
				
				// Clear any existing cooldown timer
				if (this.#cooldownTimer) {
					window.clearTimeout(this.#cooldownTimer);
				}
				
				this.#cooldownTimer = setTimeout(() => {
					this.#cooldownTimer = null;
					if (this.#debugNotifications) {
						console.log("[NotificationsSoundPlayer] Cooldown ended, checking for queued sounds");
					}
					if (this.#notificationType > -1) {
						if (this.#debugNotifications) {
							console.log("[NotificationsSoundPlayer] Found queued notification, playing next");
						}
						this.#setState(STATE_READY);
						this.play(this.#notificationType);
					} else {
						this.#setState(STATE_READY);
					}
				}, this.#cooldownDelay);
			})
			.catch((error) => {
				console.error("[NotificationsSoundPlayer] Audio play failed:", error);
				// Check if the error is a NotAllowedError (in case of autoplay restrictions)
				if (error.name === "NotAllowedError") {
					console.error(
						"VineHelper: A sound effect was blocked by the browser because you did not interact with the page."
					);
				}
				// On error, restore the notification type and go back to ready state
				if (this.#notificationType === -1 || playedNotificationType > this.#notificationType) {
					this.#notificationType = playedNotificationType;
				}
				this.#setState(STATE_READY);
			});
	}

	#getSoundAccordingToNotificationType(soundType) {
		switch (soundType) {
			case 0:
				if (Settings.get("notification.monitor.regular.sound") == "0") {
					return null;
				}
				return {
					volume: Settings.get("notification.monitor.regular.volume"),
					filename: Settings.get("notification.monitor.regular.sound"),
				};
			case 1:
				if (Settings.get("notification.monitor.zeroETV.sound") == "0") {
					return this.#getSoundAccordingToNotificationType(0);
				}
				return {
					volume: Settings.get("notification.monitor.zeroETV.volume"),
					filename: Settings.get("notification.monitor.zeroETV.sound"),
				};

			case 2:
				if (Settings.get("notification.monitor.highlight.sound") == "0") {
					return this.#getSoundAccordingToNotificationType(0);
				}
				return {
					volume: Settings.get("notification.monitor.highlight.volume"),
					filename: Settings.get("notification.monitor.highlight.sound"),
				};
		}

		throw new Error("Sound type '" + soundType + "' unsupported.");
	}
}

export { NotificationsSoundPlayer };
