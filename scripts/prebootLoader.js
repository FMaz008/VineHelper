//Load the preboot file as a module
(async () => {
	try {
		const module = await import(chrome.runtime.getURL("./scripts/preboot.js"));
	} catch (error) {
		console.error("Error loading module:", error);
	}
})();
