


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
		if(tplUrl === null)
			tplUrl = "view/notification_default.html";
		
		this.template = tplUrl;
	}

	
	//Render the notification HTML.
	async render(){
		const prom = await Tpl.loadFile(chrome.runtime.getURL(this.template));
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

	async init(){
		//Delete preexisting containers
		$("#ext-helper-notifications-container").remove();
		//Load the container
		const prom = await Tpl.loadFile( chrome.runtime.getURL("view/notification_container.html"));
		$("body").append(Tpl.render(prom));
	}
	
	
	async pushNotification(note){
		note.id = this.noteCounter++;

		//Render the notification and insert it into the container
		let content = await note.render();
		$("#ext-helper-notifications-container").prepend(content);
		
		//Bind the "close" link
		$("#ext-helper-notification-"+note.id+" .ext-helper-notification-close a").on("click", {"id": note.id}, function(event){
			Notifications.removeNote($("#ext-helper-notification-"+event.data.id));
		})
		
		//Activate the self dismissal
		if(note.lifespan>0){
			setTimeout(function(){
				Notifications.removeNote($("#ext-helper-notification-"+note.id));
			}, note.lifespan*1000);
		}
		
		//Play a sound
		if(note.sound != null){
			if(Date.now() - this.lastSoundPlayedAt > 30000){ // Don't play the notification sound again within 30 sec.
				this.lastSoundPlayedAt = Date.now();
				const audioElement = new Audio(chrome.runtime.getURL(note.sound));
				audioElement.play();
			}
		}
	}
	
	async removeNote(obj){
		//await $(obj).fadeOut().promise();
		await $(obj).animate({
			opacity: 0,
			left: "+=50",
		  }, 1000, function() {
			// Animation complete.
		  }).promise();
		$(obj).remove();
	}
}

var Notifications = new ScreenNotifier();