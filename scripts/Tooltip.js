class Tooltip {
	tooltip = null;
	constructor() {
		this.tooltip = document.createElement("div");
		this.tooltip.className = "hover-tooltip";
		document.body.appendChild(this.tooltip);
	}

	addTooltip(bindTo, title) {
		bindTo.setAttribute("data-tooltip", title);

		// Define the handler functions
		bindTo.tooltipEnterHandler = (event) => {
			this.tooltip.textContent = event.currentTarget.getAttribute("data-tooltip");
			this.tooltip.style.display = "block";
			this.#positionTooltip(event);
		};

		bindTo.tooltipLeaveHandler = () => {
			this.tooltip.style.display = "none";
		};

		bindTo.tooltipMoveHandler = (event) => {
			this.#positionTooltip(event);
		};

		// Add the event listeners
		bindTo.addEventListener("mouseenter", bindTo.tooltipEnterHandler);
		bindTo.addEventListener("mouseleave", bindTo.tooltipLeaveHandler);
		bindTo.addEventListener("mousemove", bindTo.tooltipMoveHandler);
	}

	removeTooltip(bindTo) {
		bindTo.removeEventListener("mouseenter", bindTo.tooltipEnterHandler);
		bindTo.removeEventListener("mouseleave", bindTo.tooltipLeaveHandler);
		bindTo.removeEventListener("mousemove", bindTo.tooltipMoveHandler);
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
