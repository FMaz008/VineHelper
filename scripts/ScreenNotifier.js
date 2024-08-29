/** Notification, use to configure a notificication
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
	constructor() {
		this.noteCounter = 0;
		this.lastSoundPlayedAt = Date.now();
		this.init();
	}

	/**
	 * This method can be called multiple times to ensure a container is created as early as possible.
	 */
	async init() {
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
		note.id = this.noteCounter++;

		//Render the notification and insert it into the container
		let content = await note.render();
		$("#vh-notifications-container").prepend(content);

		//Bind the "close" link
		$("#vh-notification-" + note.id + " .vh-notification-close a").on("click", { id: note.id }, function (event) {
			Notifications.removeNote($("#vh-notification-" + event.data.id));
		});

		//Activate the self dismissal
		if (note.lifespan > 0) {
			setTimeout(function () {
				Notifications.removeNote($("#vh-notification-" + note.id));
			}, note.lifespan * 1000);
		}

		//Play a sound
		if (note.sound != null) {
			if (Date.now() - this.lastSoundPlayedAt > 30000) {
				// Don't play the notification sound again within 30 sec.
				this.lastSoundPlayedAt = Date.now();
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
		//await $(obj).fadeOut().promise();
		await $(obj)
			.animate(
				{
					opacity: 0,
					left: "+=50",
				},
				250,
				function () {
					// Animation complete.
				}
			)
			.promise();
		$(obj).remove();
	}
}
