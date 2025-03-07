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
			//If we are on the monitor page, only allow the document click listeners (there are 4)
			//with options === false (there are 2), and prevent the other listeners from being added
			//as they cause resource usage issues when thousands of items are in the monitor
			//and can't get garbage collected because they have listeners on them.
			if (type == "click" && (this == document || this instanceof HTMLInputElement)) {
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
