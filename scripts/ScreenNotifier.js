var Tpl = new Template();

/** Notification, use to configure a notification
 *  will be fed to ScreenNotifier
 * */
class ScreenNotification {
	/** Constructor
	 * @var params {
	 *    id: int, //Unique ID of the notification
	 *    title: string, //Title of the notification
	 *    content: string, //Content of the notification
	 *    lifespan: int, //Time in seconds before the notification is removed. 0 = never
	 *    sound: string, //relative URL of the sound file to play.
	 *    template: string, //relative URL of the template file to use
	 *    title_only: bool, //If true, only the title will be displayed. Default: false
	 * }
	 */
	constructor(params) {
		this.id = 0;
		this.title = "";
		this.content = "";
		this.lifespan = 0; //Will not autodelete
		this.sound = null; //relative URL of the sound file to play.
		this.volume = 1;
		this.template = null; //relative URL of the template file to use
		this.title_only = false;
		this.template = "view/notification_default.html";

		if (typeof params === "object") {
			for (const key in params) {
				this[key] = params[key];
			}
		}
	}

	//Render the notification HTML.
	async render() {
		const prom = await Tpl.loadFile(this.template);
		Tpl.setVar("id", this.id);
		Tpl.setVar("title", this.title);
		Tpl.setVar("content", this.content);
		Tpl.setIf("titleonly", this.title_only);
		return Tpl.render(prom);
	}
}

/** Handle the display of notification */
class ScreenNotifier {
	#noteCounter;
	#lastSoundPlayedAt;

	constructor() {
		this.#noteCounter = 0;
		this.#lastSoundPlayedAt = Date.now();
		this.#init();
	}

	/**
	 * This method can be called multiple times to ensure a container is created as early as possible.
	 */
	async #init() {
		//If the container does not exist, create it and append it to the body.
		document.addEventListener("DOMContentLoaded", async function () {
			if (document.getElementById("vh-notifications-container") === null) {
				// Load the container
				const prom = await Tpl.loadFile("view/notification_container.html");
				document.body.append(Tpl.render(prom, true));
			}
		});
	}

	async pushNotification(note) {
		note.id = this.#noteCounter++;

		//Render the notification and insert it into the container
		let content = await note.render();
		const notificationsContainer = document.getElementById("vh-notifications-container");
		if (notificationsContainer) {
			notificationsContainer.insertAdjacentHTML("afterbegin", content);
		}

		// Bind the "close" link
		const closeLink = document.querySelector(`#vh-notification-${note.id} .vh-notification-close a`);
		if (closeLink) {
			closeLink.addEventListener("click", function (event) {
				const notificationElement = document.getElementById(`vh-notification-${note.id}`);
				if (notificationElement) {
					Notifications.removeNote(notificationElement);
				}
			});
		}

		//Bind the "toggle"  click
		const collapseLink = document.querySelector("#vh-notification-" + note.id + " .vh-notification-toggle");
		if (collapseLink) {
			collapseLink.addEventListener("click", function () {
				const containerPosition = document.getElementById("vh-notifications-container").style.right;
				if (containerPosition === "0px" || containerPosition === "") {
					document.getElementById("vh-notifications-container").style.right = "-270px";
					document.querySelectorAll(".vh-notification-toggle").forEach(function (node) {
						node.classList.remove("vh-icon-toggler-right");
						node.classList.add("vh-icon-toggler-left");
					});
				} else {
					document.getElementById("vh-notifications-container").style.right = "0px";
					document.querySelectorAll(".vh-notification-toggle").forEach(function (node) {
						node.classList.remove("vh-icon-toggler-left");
						node.classList.add("vh-icon-toggler-right");
					});
				}
			});
		}
		//Activate the self dismissal
		if (note.lifespan > 0) {
			setTimeout(function () {
				Notifications.removeNote(document.getElementById("vh-notification-" + note.id));
			}, note.lifespan * 1000);
		}

		//Play a sound
		if (note.sound != null) {
			if (Date.now() - this.#lastSoundPlayedAt > 30000) {
				// Don't play the notification sound again within 30 sec.
				this.#lastSoundPlayedAt = Date.now();
				const audioElement = new Audio(chrome.runtime.getURL(note.sound));
				const handleEnded = () => {
					audioElement.removeEventListener("ended", handleEnded); // Remove the event listener
					audioElement.remove(); // Remove the audio element from the DOM
				};
				audioElement.addEventListener("ended", handleEnded);
				audioElement.volume = Number(note.volume);
				audioElement.play();
			}
		}
	}

	async removeNote(obj) {
		if (obj == null) {
			return false;
		}
		return new Promise((resolve) => {
			let opacity = 1;
			let position = 0; // Assuming the initial left position is 0, adjust as needed.
			const duration = 100; // Animation duration in milliseconds.
			const frames = 20; // Number of frames for the animation.
			const interval = duration / frames; // Time per frame.
			const incrementOpacity = 1 / frames; // Opacity decrease per frame.
			const incrementPosition = 50 / frames; // Position change per frame.

			function animate() {
				opacity -= incrementOpacity;
				position += incrementPosition;

				if (opacity <= 0) {
					opacity = 0;
					obj.style.display = "none"; // Hide the element after animation
					resolve(); // Resolve the promise when done
				} else {
					obj.style.opacity = opacity;
					obj.style.transform = `translateX(${position}px)`;
					requestAnimationFrame(animate);
				}
			}

			animate();
		}).then(() => {
			obj.remove(); // Remove the element from the DOM
		});
	}
}
