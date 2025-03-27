class Tooltip {
	tooltip = null;
	// WeakMap to store tooltip text for each element
	#tooltipTexts = new WeakMap();

	constructor() {
		this.tooltip = document.createElement("div");
		this.tooltip.className = "hover-tooltip";
		document.body.appendChild(this.tooltip);

		// Add single event listeners at the document level
		document.addEventListener("mouseenter", this.#handleMouseEnter.bind(this), true);
		document.addEventListener("mouseleave", this.#handleMouseLeave.bind(this), true);
		document.addEventListener("mousemove", this.#handleMouseMove.bind(this), true);
	}

	addTooltip(bindTo, title) {
		bindTo.setAttribute("data-tooltip", title);
		// Store the tooltip text in WeakMap
		this.#tooltipTexts.set(bindTo, title);
	}

	removeTooltip(bindTo) {
		bindTo.removeAttribute("data-tooltip");
		this.#tooltipTexts.delete(bindTo);
	}

	#handleMouseEnter(event) {
		const target = event.target;
		const tooltipText = this.#tooltipTexts.get(target);
		if (tooltipText) {
			this.tooltip.textContent = tooltipText;
			this.tooltip.style.display = "block";
			this.#positionTooltip(event);
		}
	}

	#handleMouseLeave(event) {
		if (this.#tooltipTexts.has(event.target)) {
			this.tooltip.style.display = "none";
		}
	}

	#handleMouseMove(event) {
		const target = event.target.closest(".a-link-normal");
		if (target && this.#tooltipTexts.has(target)) {
			this.#positionTooltip(event);
		}
	}

	#positionTooltip(event) {
		const tooltipRect = this.tooltip.getBoundingClientRect();
		const offsetX = 10; // horizontal offset from the link element
		const offsetY = 10; // vertical offset from the link element

		// Use pageX and pageY to account for the scrolled distance
		let tooltipX = event.pageX + offsetX;
		let tooltipY = event.pageY + offsetY;

		// Ensure the tooltip doesn't go off-screen
		if (tooltipX + tooltipRect.width > window.scrollX + document.documentElement.clientWidth) {
			tooltipX = event.pageX - tooltipRect.width - offsetX;
		}

		if (tooltipY + tooltipRect.height > window.scrollY + document.documentElement.clientHeight) {
			tooltipY = event.pageY - tooltipRect.height - offsetY;
		}

		this.tooltip.style.left = `${tooltipX}px`;
		this.tooltip.style.top = `${tooltipY}px`;
	}
}

export { Tooltip };
