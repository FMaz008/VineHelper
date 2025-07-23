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
	 * Core method for setting background styles on an element
	 * @param {HTMLElement} element - The element to style
	 * @param {string|null} style - The CSS background value to apply (null to clear)
	 * @param {boolean} isGradient - Whether to use 'background' (true) or 'backgroundColor' (false)
	 * @param {boolean} forceRecalculation - Whether to force style recalculation after changes
	 * @private
	 */
	static setBackground(element, style, isGradient = false, forceRecalculation = false) {
		if (!element || !element.style) return;

		// Clear both background properties
		element.style.background = "";
		element.style.backgroundColor = "";

		// Apply new style if provided
		if (style) {
			if (isGradient) {
				element.style.background = style;
			} else {
				element.style.backgroundColor = style;
			}
		}

		// Force style recalculation if requested (only needed when clearing without applying new style)
		if (forceRecalculation) {
			void element.offsetHeight;
		}
	}

	/**
	 * Clears both background properties to ensure clean state before applying new styles
	 * @param {HTMLElement} element - The element to clear backgrounds on
	 */
	static clearBackgrounds(element) {
		// Use setBackground with null style and force recalculation
		this.setBackground(element, null, false, true);
	}

	/**
	 * Applies background styling to an element, clearing previous backgrounds first
	 * @param {HTMLElement} element - The element to style
	 * @param {string} style - The CSS background value to apply
	 * @param {boolean} isGradient - Whether to use 'background' (true) or 'backgroundColor' (false)
	 */
	static applyBackground(element, style, isGradient = false) {
		if (!style) return;
		// Use setBackground without force recalculation (not needed when applying new style)
		this.setBackground(element, style, isGradient, false);
	}
}
