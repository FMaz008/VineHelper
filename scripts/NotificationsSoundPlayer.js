class NotificationsSoundPlayer {
	//ToDo: Add state
	#waitTimer;
	#waitDelay;
	#notificationType;

	constructor() {
		this.#waitDelay = 100;
		this.#notificationType = -1; //-1 = no sound to play
	}

	play(notificationType) {
		//Save the highest notification type
		if (notificationType >= this.#notificationType) {
			this.#notificationType = notificationType;
		}

		//Play logic
		clearTimeout(this.#waitTimer);
		this.#waitTimer = setTimeout(() => {
			this.#playSound(this.#notificationType);
			this.#notificationType = -1;
		}, this.#waitDelay);
	}

	#playSound(soundType) {
		let data = this.#getSoundAccordingToNotificationType(soundType);
		if (data == null) {
			return;
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
		audioElement.play();
		//Todo: Reset the cooldown to 2000ms
	}

	#getSoundAccordingToNotificationType(soundType) {
		switch (soundType) {
			case 0:
				return {
					volume: Settings.get("notification.monitor.regular.volume"),
					filename: Settings.get("notification.monitor.regular.sound"),
				};
			case 1:
				return {
					volume: Settings.get("notification.monitor.zeroETV.volume"),
					filename: Settings.get("notification.monitor.zeroETV.sound"),
				};
			case 2:
				return {
					volume: Settings.get("notification.monitor.highlight.volume"),
					filename: Settings.get("notification.monitor.highlight.sound"),
				};
		}
		return null;
	}
}

export { NotificationsSoundPlayer };
