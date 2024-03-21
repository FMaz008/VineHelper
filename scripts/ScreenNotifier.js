/** Notification, use to configure a notificication
 *  will be fed to ScreenNotifier
 * */
class ScreenNotification {
	id = 0;
	title = "";
	content = "";
	lifespan = 0; //Will not autodelete
	sound = null; //relative URL of the sound file to play.
	template = null; //relative URL of the template file to use

	/** Constructor
	 * @var tplUrl URL of the template to use, null=default.
	 */
	constructor(tplUrl = null) {
		if (tplUrl === null) tplUrl = "view/notification_default.html";

		this.template = tplUrl;
	}

	//Render the notification HTML.
	async render() {
		const prom = await Tpl.loadFile(this.template);
		Tpl.setVar("id", this.id);
		Tpl.setVar("title", this.title);
		Tpl.setVar("content", this.content);
		return Tpl.render(prom);
	}
}

/** Handle the display of notification */
class ScreenNotifier {
	noteCounter = 0;
	lastSoundPlayedAt = Date.now();

	constructor() {
		this.init();
	}

	/**
	 * This method can be called multiple times to ensure a container is created as early as possible.
	 */
	async init() {
		//If the container does not exist, create it and append it to the body.
		if ($("#vh-notifications-container").length == 0) {
			//Load the container
			const prom = await Tpl.loadFile("view/notification_container.html");
			$("body").append(Tpl.render(prom));
		}
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
