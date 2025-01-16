import { Logger } from "./Logger.js";
var logger = new Logger();

import { SettingsMgr } from "./SettingsMgr.js";
const Settings = new SettingsMgr();

import { Template } from "./Template.js";
var Tpl = new Template();

class TileSizer {
	constructor() {}

	injectGUI = async function (container) {
		//Insert the template
		const prom = await Tpl.loadFile("view/widget_tilesize.html");
		let content = Tpl.render(prom, true);
		container.insertBefore(content, container.firstChild);

		//Bind the actions to the template elements.
		//Bind the open link
		const openContainer = container.querySelector("#openTileSizeTool");
		const openLink = container.querySelector("#openTileSizeTool>a");
		const sizeContainer = container.querySelector("#tileSizeTool");
		const closeLink = container.querySelector("#tileSizeTool>a");
		openLink.addEventListener("click", (e) => {
			e.preventDefault();
			openContainer.style.display = "none";
			sizeContainer.style.display = "block";
		});
		//Bind the close link
		closeLink.addEventListener("click", (e) => {
			e.preventDefault();
			openContainer.style.display = "block";
			sizeContainer.style.display = "none";
		});

		//Bind the action to all the sliders
		//Tile size
		const sliderTile = document.querySelector("input[name='general.tileSize.width']");
		sliderTile.value = Settings.get("general.tileSize.width");

		sliderTile.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderTile.value);
			await Settings.set("general.tileSize.width", sliderValue);
			this.#adjustTileSize();
		});
		sliderTile.addEventListener("input", () => {
			// This will fire continuously while sliding
			const sliderValue = parseInt(sliderTile.value);
			this.#adjustTileSize(null, sliderValue);
		});

		//Icons size
		const sliderIcons = document.querySelector("input[name='general.tileSize.iconSize']");
		sliderIcons.value = Settings.get("general.tileSize.iconSize");

		sliderIcons.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderIcons.value);
			await Settings.set("general.tileSize.iconSize", sliderValue);
			this.#adjustIconsSize();
		});
		sliderIcons.addEventListener("input", () => {
			const sliderValue = parseInt(sliderIcons.value);
			this.#adjustIconsSize(null, sliderValue);
		});

		//Icons size
		const sliderVertSpacing = document.querySelector("input[name='general.tileSize.verticalSpacing']");
		sliderVertSpacing.value = Settings.get("general.tileSize.verticalSpacing");

		sliderVertSpacing.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderVertSpacing.value);
			await Settings.set("general.tileSize.verticalSpacing", sliderValue);
			this.#adjustVerticalSpacing();
		});
		sliderVertSpacing.addEventListener("input", () => {
			const sliderValue = parseInt(sliderVertSpacing.value);
			this.#adjustVerticalSpacing(null, sliderValue);
		});

		//Title spacing
		const sliderTitleSpacing = document.querySelector("input[name='general.tileSize.titleSpacing']");
		sliderTitleSpacing.value = Settings.get("general.tileSize.titleSpacing");

		sliderTitleSpacing.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderTitleSpacing.value);
			await Settings.set("general.tileSize.titleSpacing", sliderValue);
			this.#adjustTitleSpacing();
		});
		sliderTitleSpacing.addEventListener("input", () => {
			const sliderValue = parseInt(sliderTitleSpacing.value);
			this.#adjustTitleSpacing(null, sliderValue);
		});

		//Font size
		const sliderFontSize = document.querySelector("input[name='general.tileSize.fontSize']");
		sliderFontSize.value = Settings.get("general.tileSize.fontSize");

		sliderFontSize.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderFontSize.value);
			await Settings.set("general.tileSize.fontSize", sliderValue);
			this.#adjustFontSize();
		});
		sliderFontSize.addEventListener("input", () => {
			const sliderValue = parseInt(sliderFontSize.value);
			this.#adjustFontSize(null, sliderValue);
		});
	};

	adjustAll = function (DOMElem = null) {
		if (Settings.get("general.tileSize.enabled")) {
			this.#adjustTileSize(DOMElem);
			this.#adjustIconsSize(DOMElem);
			this.#adjustVerticalSpacing(DOMElem);
			this.#adjustTitleSpacing(DOMElem);
			this.#adjustFontSize(DOMElem);
		}
	};

	#adjustTileSize = function (DOMElem = null, sliderValue = null) {
		const width = parseInt(sliderValue || Settings.get("general.tileSize.width"));
		if (DOMElem == null) {
			//Adjust all elements on the page
			const grids = document.querySelectorAll("div#vh-tabs .tab-grid");
			grids.forEach((elem) => {
				elem.style.gridTemplateColumns = `repeat(auto-fill,minmax(${width}px,auto))`;
				elem.querySelectorAll(".vvp-item-tile .vvp-item-tile-content").forEach((tile) => {
					tile.style.width = parseInt(width - 8) + "px";
				});
			});
		} else {
			//Target 1 specific element
			DOMElem.querySelector(".vvp-item-tile-content").style.width = width - 8 + "px";
		}
	};

	#adjustIconsSize = function (DOMElem = null, sliderValue = null) {
		const size = parseInt(sliderValue || Settings.get("general.tileSize.iconSize"));
		const selector = ".vh-status-container a>.vh-toolbar-icon";
		const elements = (DOMElem || document).querySelectorAll(
			DOMElem ? selector : `div#vh-tabs .tab-grid ${selector}`
		);
		elements.forEach((elem) => {
			elem.style.width = size + "px";
			elem.style.height = size + "px";
		});
	};

	#adjustVerticalSpacing = function (DOMElem = null, sliderValue = null) {
		const size = parseInt(sliderValue || Settings.get("general.tileSize.verticalSpacing"));
		const selector =
			".vvp-item-tile-content .vvp-item-product-title-container, .vvp-item-tile-content .vvp-details-btn";
		const elements = (DOMElem || document).querySelectorAll(selector);
		elements.forEach((elem) => {
			elem.style.margin = size + "px 0";
		});
	};

	#adjustTitleSpacing = function (DOMElem = null, sliderValue = null) {
		const size = parseFloat(sliderValue || Settings.get("general.tileSize.titleSpacing"));
		//Adjust all elements on the page
		const box1 = (DOMElem || document).querySelectorAll(
			".vvp-item-tile-content .vvp-item-product-title-container .a-truncate"
		);
		box1.forEach((elem) => {
			elem.style.maxHeight = size + "px";
		});

		const box2 = (DOMElem || document).querySelectorAll(
			".vvp-item-tile-content .vvp-item-product-title-container .a-truncate-cut"
		);
		box2.forEach((elem) => {
			elem.style.height = size + "px";
		});
	};

	#adjustFontSize = function (DOMElem = null, sliderValue = null) {
		const size = parseInt(sliderValue || Settings.get("general.tileSize.fontSize"));
		const selector = ".vvp-item-tile-content .vvp-item-product-title-container .a-truncate";
		const elements = (DOMElem || document).querySelectorAll(selector);
		elements.forEach((elem) => {
			elem.style.fontSize = size + "px";
		});
	};
}

export { TileSizer };
