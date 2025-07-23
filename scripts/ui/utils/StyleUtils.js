/**
 * Utility functions for styling operations
 */
export class StyleUtils {
	/**
	 * Creates a repeating diagonal gradient pattern for combined highlight states
	 * @param {string} color1 - First color (typically the special state color like zero/unknown ETV)
	 * @param {string} color2 - Second color (typically the highlight color)
	 * @returns {string} CSS gradient string
	 */
	static createStripedGradient(color1, color2) {
		return `repeating-linear-gradient(-45deg, ${color1} 0px, ${color1} 20px, ${color2} 20px, ${color2} 40px)`;
	}

	/**
	 * Clears both background properties to ensure clean state before applying new styles
	 * @param {HTMLElement} element - The element to clear backgrounds on
	 */
	static clearBackgrounds(element) {
		if (!element || !element.style) return;
		element.style.background = "";
		element.style.backgroundColor = "";

		// Force style recalculation to ensure changes take effect
		void element.offsetHeight;
	}

	/**
	 * Applies background styling to an element, clearing previous backgrounds first
	 * @param {HTMLElement} element - The element to style
	 * @param {string} style - The CSS background value to apply
	 * @param {boolean} isGradient - Whether to use 'background' (true) or 'backgroundColor' (false)
	 */
	static applyBackground(element, style, isGradient = false) {
		if (!element || !element.style || !style) return;

		this.clearBackgrounds(element);

		if (isGradient) {
			element.style.background = style;
		} else {
			element.style.backgroundColor = style;
		}
	}
}
