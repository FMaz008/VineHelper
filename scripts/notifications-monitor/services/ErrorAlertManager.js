/**
 * ErrorAlertManager - Manages error alert boxes by adding close functionality
 *
 * This service monitors for error alert boxes (including VineHelper's vh-* error messages)
 * and adds close buttons to allow users to dismiss them.
 *
 * This service is designed to work with dependency injection and has no external dependencies,
 * making it easy to test and reuse.
 */
export class ErrorAlertManager {
	#observer = null;
	#processedAlerts = new WeakSet();
	#document;
	#isInitialized = false;

	/**
	 * @param {Document} document - The document object (defaults to global document)
	 */
	constructor(document = window.document) {
		this.#document = document;
	}

	/**
	 * Initialize the error alert manager
	 */
	initialize() {
		if (this.#isInitialized) {
			return;
		}

		// Add styles
		this.#setupStyles();

		// Process any existing alerts
		this.#processExistingAlerts();

		// Set up observer for new alerts
		this.#setupObserver();

		this.#isInitialized = true;
	}

	/**
	 * Add custom styles for the close button
	 */
	#setupStyles() {
		const style = this.#document.createElement("style");
		style.textContent = `
			.vh-alert-close-btn {
				position: absolute;
				right: 15px;
				top: 15px;
				cursor: pointer;
				width: 24px;
				height: 24px;
				border-radius: 50%;
				background-color: #d13212;
				color: white;
				font-size: 16px;
				font-weight: bold;
				border: 2px solid #b02a0c;
				display: flex;
				align-items: center;
				justify-content: center;
				line-height: 1;
				padding: 0;
				transition: all 0.2s ease;
				box-shadow: 0 2px 4px rgba(0,0,0,0.2);
				z-index: 1;
			}
			.vh-alert-close-btn:hover {
				background-color: #b02a0c;
				transform: scale(1.1);
				box-shadow: 0 3px 6px rgba(0,0,0,0.3);
			}
			.vh-alert-close-btn:active {
				transform: scale(0.95);
			}
			.a-alert-container {
				position: relative;
			}
		`;
		this.#document.head.appendChild(style);
	}

	/**
	 * Process any alerts that are already on the page
	 */
	#processExistingAlerts() {
		// Process all error alerts using CSS selectors
		const errorAlerts = this.#document.querySelectorAll(".a-box.a-alert.a-alert-error:not(.aok-hidden)");
		errorAlerts.forEach((alert) => this.#addCloseButton(alert));
	}

	/**
	 * Set up mutation observer to watch for new alerts
	 */
	#setupObserver() {
		this.#observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				// Check for alerts becoming visible (class change)
				if (mutation.type === "attributes" && mutation.attributeName === "class") {
					const target = mutation.target;
					if (this.#isErrorAlert(target) && !target.classList.contains("aok-hidden")) {
						this.#addCloseButton(target);
					}
				}

				// Check for new alert nodes
				if (mutation.type === "childList") {
					mutation.addedNodes.forEach((node) => {
						if (node.nodeType === Node.ELEMENT_NODE) {
							// Check if the node itself is an alert
							if (this.#isErrorAlert(node) && !node.classList.contains("aok-hidden")) {
								this.#addCloseButton(node);
							}
							// Check for alerts within the added node
							const alerts = node.querySelectorAll?.(".a-box.a-alert.a-alert-error:not(.aok-hidden)");
							alerts?.forEach((alert) => this.#addCloseButton(alert));
						}
					});
				}
			});
		});

		// Observe the entire document for changes
		this.#observer.observe(this.#document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	/**
	 * Check if an element is an error alert
	 */
	#isErrorAlert(element) {
		// Check for Amazon-style error alerts using CSS classes
		return (
			element.classList?.contains("a-box") &&
			element.classList?.contains("a-alert") &&
			element.classList?.contains("a-alert-error")
		);
	}

	/**
	 * Add a close button to an alert
	 */
	#addCloseButton(alert) {
		// Skip if already processed
		if (this.#processedAlerts.has(alert)) {
			return;
		}

		// Mark as processed
		this.#processedAlerts.add(alert);

		// Create close button
		const closeBtn = this.#document.createElement("button");
		closeBtn.className = "vh-alert-close-btn";
		closeBtn.innerHTML = "×";
		closeBtn.title = "Close this alert";
		closeBtn.setAttribute("aria-label", "Close alert");

		// Add click handler
		closeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.#hideAlert(alert);
		});

		// Add the button to the alert container for better positioning
		const alertContainer = alert.querySelector(".a-alert-container");
		if (alertContainer) {
			alertContainer.appendChild(closeBtn);
		} else {
			// Fallback to alert element if container not found
			alert.appendChild(closeBtn);
		}
	}

	/**
	 * Hide an alert by adding the aok-hidden class
	 */
	#hideAlert(alert) {
		alert.classList.add("aok-hidden");
	}

	/**
	 * Cleanup the observer when needed
	 */
	destroy() {
		if (this.#observer) {
			this.#observer.disconnect();
			this.#observer = null;
		}
	}
}
