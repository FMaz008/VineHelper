//Load the bootloader file as a module
(async () => {
	try {
		const module = await import(chrome.runtime.getURL("./scripts/bootloader.js"));
	} catch (error) {
		console.error("Error loading module:", error);
		console.trace();
	}
})();
