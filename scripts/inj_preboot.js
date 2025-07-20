(function () {
	//In the notification monitor, block the MutationObservers from holding references to the DOM nodes.
	if (window.location.href.match(/^[^#]+#monitor$/) != null) {
		// Monkey patch MutationObserver to prevent memory leaks
		const OriginalMutationObserver = window.MutationObserver;
		window.MutationObserver = function (callback) {
			// Create observer with wrapped callback that cleans up references
			const observer = new OriginalMutationObserver((mutations, obs) => {
				try {
					// Call original callback
					//callback(mutations, obs); //Do not call the original callback, or it will hold references to the DOM nodes.
				} finally {
					// Clear mutation records to prevent holding references
					mutations.forEach((mutation) => {
						mutation.target = null;
						mutation.previousSibling = null;
						mutation.nextSibling = null;
						mutation.addedNodes = null;
						mutation.removedNodes = null;
					});
				}
			});

			// Copy prototype methods
			observer.observe = OriginalMutationObserver.prototype.observe.bind(observer);
			observer.disconnect = OriginalMutationObserver.prototype.disconnect.bind(observer);
			observer.takeRecords = OriginalMutationObserver.prototype.takeRecords.bind(observer);

			return observer;
		};
	}
})();
