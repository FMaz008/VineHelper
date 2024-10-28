//This file contain the list of service worker scripts to be loaded for plugins
//import "./myPlugin/serviceWorker.js";

const ARR_PLUGIN_CONTENT_SCRIPTS = []; // ["myPlugin/contentScript.js"];

//#####################################################
//## PLUGIN SYSTEM
//#####################################################

//The plugin can't be run using the official release as they are bundled and can't be changed.
//Check if the manifest.json pas the scripting permission, which is the case for the github code.
//If so, activate the plugin system.

chrome.permissions.contains({ permissions: ["scripting"] }, (result) => {
	if (result) {
		//Import plugin service workers' scripts

		/*
		for (let i = 0; i < ARR_PLUGIN_SERVICE_WORKERS.length; i++) {
			console.log("Importing service worker " + ARR_PLUGIN_SERVICE_WORKERS[i]);
			//importScripts("../plugins/" + ARR_PLUGIN_SERVICE_WORKERS[i]);
		}
		*/

		//Import plugin content_scripts
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			if (message.action === "injectPluginsContentScripts") {
				for (let i = 0; i < ARR_PLUGIN_CONTENT_SCRIPTS.length; i++) {
					// Inject the specified script into the content script context
					chrome.scripting.executeScript(
						{
							target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
							files: ["plugins/" + ARR_PLUGIN_CONTENT_SCRIPTS[i]],
						},
						() => {
							if (chrome.runtime.lastError) {
								console.error(chrome.runtime.lastError);
							} else {
								console.log(`Imported content_script ${ARR_PLUGIN_CONTENT_SCRIPTS[i]}.`);
							}
						}
					);
				}
			}
		});
	}
});
