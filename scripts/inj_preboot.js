(function () {
	if (window.location.href.match(/^[^#]+#monitor$/) != null) {
		//If this is the monitor page,
		//Monkey patch the addEventListener and removeEventListener functions

		const originalAddEventListener = EventTarget.prototype.addEventListener;
		const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

		EventTarget.prototype.addEventListener = function (type, listener, options) {
			/*
			this._listeners = this._listeners || {};
			this._listeners[type] = this._listeners[type] || [];
			this._listeners[type].push(listener);
			*/
			// On the monitor page, we selectively allow event listeners to prevent memory leaks:
			// - Click handlers are restricted to: document, input elements, and #vvp-items-grid (for VineHelper)
			// - All non-click events are allowed (needed for page initialization, WebSocket, etc.)
			// This prevents Amazon from attaching click handlers to thousands of individual items,
			// which would prevent garbage collection and cause memory usage to grow continuously.

			// Check if this is the grid container (VineHelper uses event delegation on this element)
			const isGridContainer =
				this.id === "vvp-items-grid" || (this.getAttribute && this.getAttribute("id") === "vvp-items-grid");

			if (type == "click" && (this == document || this instanceof HTMLInputElement || isGridContainer)) {
				originalAddEventListener.call(this, type, listener, options);
			} else if (type !== "click") {
				// Allow non-click event listeners
				originalAddEventListener.call(this, type, listener, options);
			}
		};

		/*
		EventTarget.prototype.removeEventListener = function (type, listener, options) {
			if (this._listeners && this._listeners[type]) {
				this._listeners[type] = this._listeners[type].filter((l) => l !== listener);
			}
			originalRemoveEventListener.call(this, type, listener, options);
		};

		EventTarget.prototype.removeAllEventListeners = function () {
			if (this._listeners) {
				for (const type in this._listeners) {
					this._listeners[type].forEach((listener) => {
						originalRemoveEventListener.call(this, type, listener);
					});
				}
				this._listeners = {};
			}
		};
		*/
	}
})();
