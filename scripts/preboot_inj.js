const scriptTag = document.createElement("script");

//Inject the infinite loading wheel fix to the "main world"
scriptTag.src = chrome.runtime.getURL("scripts/inj_preboot.js");
scriptTag.onload = function () {
	this.remove();
};
// see also "Dynamic values in the injected code" section in this answer
(document.head || document.documentElement).appendChild(scriptTag);
