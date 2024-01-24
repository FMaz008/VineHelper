
var Notifications = new ScreenNotifier();

function ScreenNotification(){
	this.id = 0;
	this.title = "";
	this.content = "";
	this.lifespan = 0; //Will not auto-delete
	this.sound = null; //relative file path of the sound file to play.
	this.template = chrome.runtime.getURL("view/notification_default.html");
	
	//Render the notification HTML.
	this.render = async function(){
		
		let tpl = new Template();
		await tpl.loadFile(this.template);
		tpl.setVar("id", this.id);
		tpl.setVar("title", this.title);
		tpl.setVar("content", this.content);
		return tpl.render();
	}
	
}

function ScreenNotifier(){
	
	async function init(){
		//Delete preexisting containers
		$("#ext-helper-notifications-container").remove();
		//Load the container
		let tpl = new Template();
		await tpl.loadFile( chrome.runtime.getURL("view/notification_container.html"));
		$("body").append(tpl.render());
	}
	init();
	
	
	this.pushNotification = async function(note){
		note.id = $(".ext-helper-notification-box").length;
		
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
			const audioElement = new Audio(chrome.runtime.getURL(note.sound));
			audioElement.play();
		}
	}
	
	this.removeNote = async function(obj){
		await $(obj).fadeOut().promise();
		$(obj).remove();
	}
}