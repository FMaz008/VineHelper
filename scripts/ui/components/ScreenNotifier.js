import { Template } from "/scripts/core/utils/Template.js";
import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Tpl = new Template();
var Settings = new SettingsMgr();

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
		this.template = "scripts/ui/templates/notification_default.html";

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
	static #instance = null;

	#noteCounter;
	#soundPlayer;
	#debugNotifications;

	constructor() {
		if (ScreenNotifier.#instance) {
			return ScreenNotifier.#instance;
		}
		ScreenNotifier.#instance = this;

		this.#noteCounter = 0;
		// Use NotificationsSoundPlayer for centralized sound management
		this.#soundPlayer = null;
		this.#debugNotifications = false;
		this.#init();
	}

	/**
	 * This method can be called multiple times to ensure a container is created as early as possible.
	 */
	async #init() {
		// Initialize sound player
		import("/scripts/ui/components/NotificationsSoundPlayer.js").then(module => {
			this.#soundPlayer = new module.NotificationsSoundPlayer();
		});

		// Check debug flag
		this.#debugNotifications = Settings.get("general.debugNotifications");

		//If the container does not exist, create it and append it to the body.
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", async () => {
				if (document.getElementById("vh-notifications-container") === null) {
					// Load the container
					this.#injectContainer();
				}
			});
		} else {
			this.#injectContainer();
		}
	}

	async #injectContainer() {
		const prom = await Tpl.loadFile("scripts/ui/templates/notification_container.html");
		document.body.append(Tpl.render(prom, true));
	}
	async pushNotification(note) {
		note.id = this.#noteCounter++;
		
		// ISSUE #1 FIX: Track OS notification coordination
		const isMasterMonitor = window._notificationMonitor?._isMasterMonitor;
		
		if (this.#debugNotifications) {
			console.log("[ScreenNotifier] OS Notification Push", {
				noteId: note.id,
				title: note.title,
				isMasterMonitor: isMasterMonitor,
				monitorId: window._notificationMonitor?._monitorId,
				timestamp: Date.now(),
				stackTrace: new Error().stack
			});
		}
		
		// ISSUE #1 FIX: Only allow master monitor to show OS notifications
		if (isMasterMonitor === false) {
			if (this.#debugNotifications) {
				console.warn("[ScreenNotifier] BLOCKED: Slave monitor attempted OS notification", {
					title: note.title,
					monitorId: window._notificationMonitor?._monitorId
				});
			}
			return; // Don't show OS notifications in slave monitors
		}
		
		// Also block if master/slave status is not yet determined
		if (isMasterMonitor === undefined && window._notificationMonitor) {
			if (this.#debugNotifications) {
				console.log("[ScreenNotifier] DEFERRED: Master/slave status not yet determined", {
					title: note.title,
					monitorId: window._notificationMonitor?._monitorId
				});
			}
			return;
		}

		//Render the notification and insert it into the container
		let content = await note.render();
		const notificationsContainer = document.getElementById("vh-notifications-container");
		if (notificationsContainer) {
			notificationsContainer.insertAdjacentHTML("afterbegin", content);
		}

		// Bind the "close" link
		const closeLink = document.querySelector(`#vh-notification-${note.id} .vh-notification-close a`);
		if (closeLink) {
			closeLink.addEventListener("click", (event) => {
				const notificationElement = document.getElementById(`vh-notification-${note.id}`);
				if (notificationElement) {
					this.removeNote(notificationElement);
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
			setTimeout(() => {
				this.removeNote(document.getElementById("vh-notification-" + note.id));
			}, note.lifespan * 1000);
		}

		//Play a sound using centralized sound player
		if (note.sound != null && this.#soundPlayer) {
			if (this.#debugNotifications) {
				console.log("[ScreenNotifier] Delegating sound to NotificationsSoundPlayer:", {
					noteId: note.id,
					sound: note.sound,
					volume: note.volume
				});
			}
			
			// Determine notification type based on sound file
			let notificationType = 0; // Default to regular
			if (note.sound.includes("cash-register") || note.sound.includes("vintage-horn")) {
				notificationType = 1; // Zero ETV
			} else if (note.sound.includes("tada") || note.sound.includes("upgrade")) {
				notificationType = 2; // Highlight
			}
			
			// Use NotificationsSoundPlayer which handles its own cooldown
			this.#soundPlayer.play(notificationType);
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

export { ScreenNotification, ScreenNotifier };
