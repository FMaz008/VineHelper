import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
const Settings = new SettingsMgr();

import { Template } from "/scripts/core/utils/Template.js";
var Tpl = new Template();

class TileSizer {
	#settingPrefix = null;
	constructor(settingPrefix = "general.tileSize") {
		this.#settingPrefix = settingPrefix;
	}

	injectGUI = async function (container) {
		//Insert the template
		const prom = await Tpl.loadFile("scripts/ui/templates/widget_tilesize.html");
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
		sliderTile.value = Settings.get(`${this.#settingPrefix}.width`);

		sliderTile.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderTile.value);
			await Settings.set(`${this.#settingPrefix}.width`, sliderValue);
			this.#adjustTileSize();
		});
		sliderTile.addEventListener("input", () => {
			// This will fire continuously while sliding
			const sliderValue = parseInt(sliderTile.value);
			this.#adjustTileSize(null, sliderValue);
		});

		//Icons size
		const sliderIcons = document.querySelector("input[name='general.tileSize.iconSize']");
		sliderIcons.value = Settings.get(`${this.#settingPrefix}.iconSize`);

		sliderIcons.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderIcons.value);
			await Settings.set(`${this.#settingPrefix}.iconSize`, sliderValue);
			this.#adjustIconsSize();
		});
		sliderIcons.addEventListener("input", () => {
			const sliderValue = parseInt(sliderIcons.value);
			this.#adjustIconsSize(null, sliderValue);
		});

		//Icons size
		const sliderVertSpacing = document.querySelector("input[name='general.tileSize.verticalSpacing']");
		sliderVertSpacing.value = Settings.get(`${this.#settingPrefix}.verticalSpacing`);

		sliderVertSpacing.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderVertSpacing.value);
			await Settings.set(`${this.#settingPrefix}.verticalSpacing`, sliderValue);
			this.#adjustVerticalSpacing();
		});
		sliderVertSpacing.addEventListener("input", () => {
			const sliderValue = parseInt(sliderVertSpacing.value);
			this.#adjustVerticalSpacing(null, sliderValue);
		});

		//Title spacing
		const sliderTitleSpacing = document.querySelector("input[name='general.tileSize.titleSpacing']");
		sliderTitleSpacing.value = Settings.get(`${this.#settingPrefix}.titleSpacing`);

		sliderTitleSpacing.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderTitleSpacing.value);
			await Settings.set(`${this.#settingPrefix}.titleSpacing`, sliderValue);
			this.#adjustTitleSpacing();
		});
		sliderTitleSpacing.addEventListener("input", () => {
			const sliderValue = parseInt(sliderTitleSpacing.value);
			this.#adjustTitleSpacing(null, sliderValue);
		});

		//Font size
		const sliderFontSize = document.querySelector("input[name='general.tileSize.fontSize']");
		sliderFontSize.value = Settings.get(`${this.#settingPrefix}.fontSize`);

		sliderFontSize.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderFontSize.value);
			await Settings.set(`${this.#settingPrefix}.fontSize`, sliderValue);
			this.#adjustFontSize();
		});
		sliderFontSize.addEventListener("input", () => {
			const sliderValue = parseInt(sliderFontSize.value);
			this.#adjustFontSize(null, sliderValue);
		});

		//Toolbar font size
		const sliderToolbarFontSize = document.querySelector("input[name='general.tileSize.toolbarFontSize']");
		sliderToolbarFontSize.value = Settings.get(`${this.#settingPrefix}.toolbarFontSize`);

		sliderToolbarFontSize.addEventListener("change", async () => {
			const sliderValue = parseInt(sliderToolbarFontSize.value);
			await Settings.set(`${this.#settingPrefix}.toolbarFontSize`, sliderValue);
			this.#adjustToolbarFontSize();
		});
		sliderToolbarFontSize.addEventListener("input", () => {
			const sliderValue = parseInt(sliderToolbarFontSize.value);
			this.#adjustToolbarFontSize(null, sliderValue);
		});
	};

	adjustAll = function (DOMElem = null) {
		if (Settings.get("general.tileSize.enabled")) {
			this.#adjustTileSize(DOMElem);
			this.#adjustIconsSize(DOMElem);
			this.#adjustVerticalSpacing(DOMElem);
			this.#adjustTitleSpacing(DOMElem);
			this.#adjustFontSize(DOMElem);
			this.#adjustToolbarFontSize(DOMElem);
		}
	};

	#adjustTileSize = function (DOMElem = null, sliderValue = null) {
		const width = parseInt(sliderValue || Settings.get(`${this.#settingPrefix}.width`));
		if (DOMElem == null) {
			//Adjust all elements on the page
			const grids = document.querySelectorAll("div#vh-tabs .tab-grid");
			grids.forEach((elem) => {
				elem.style.gridTemplateColumns = `repeat(auto-fill,minmax(${width}px,auto))`;
				elem.style.columnGap = `0px`;
				elem.querySelectorAll(".vvp-item-tile .vvp-item-tile-content").forEach((tile) => {
					tile.style.width = parseInt(width) - 4 + "px";
				});
			});
		} else {
			//Target 1 specific element
			DOMElem.querySelector(".vvp-item-tile-content").style.width = parseInt(width) - 4 + "px";
		}
	};

	#adjustIconsSize = function (DOMElem = null, sliderValue = null) {
		const size = parseInt(sliderValue || Settings.get(`${this.#settingPrefix}.iconSize`));
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
		const size = parseInt(sliderValue || Settings.get(`${this.#settingPrefix}.verticalSpacing`));
		const selectors = [
			".vvp-item-tile-content>.vvp-item-product-title-container",
			".vvp-item-tile-content>.vvp-details-btn",
			".vvp-item-tile-content>.a-button-primary",
			".vvp-item-tile-content>.vh-btn-container",
		];
		for (const selector of selectors) {
			const elements = (DOMElem || document).querySelectorAll(selector);
			elements.forEach((elem) => {
				elem.style.margin = size + "px 0";
			});
		}

		//Adjust the vertical spacing in case of vh-btn-container
		const grandChildren = [".vvp-item-tile-content>.vh-btn-container>.vvp-details-btn"];
		for (const selector of grandChildren) {
			const elements = (DOMElem || document).querySelectorAll(selector);
			elements.forEach((elem) => {
				elem.style.flexGrow = "1";
			});
		}
	};

	#adjustTitleSpacing = function (DOMElem = null, sliderValue = null) {
		const size = parseFloat(sliderValue || Settings.get(`${this.#settingPrefix}.titleSpacing`));
		//Adjust all elements on the page
		const box1 = (DOMElem || document).querySelectorAll(
			".vvp-item-tile-content .vvp-item-product-title-container .a-truncate, .vvp-item-tile-content .vvp-item-product-title-container .a-truncate-cut, .vvp-item-tile-content .vvp-item-product-title-container"
		);
		box1.forEach((elem) => {
			elem.style.height = size + "px";
			elem.style.maxHeight = size + "px";
		});
	};

	#adjustFontSize = function (DOMElem = null, sliderValue = null) {
		const size = parseInt(sliderValue || Settings.get(`${this.#settingPrefix}.fontSize`));
		const selector = ".vvp-item-tile-content .vvp-item-product-title-container .a-truncate";
		const elements = (DOMElem || document).querySelectorAll(selector);
		elements.forEach((elem) => {
			elem.style.fontSize = size + "px";
		});
	};

	#adjustToolbarFontSize = function (DOMElem = null, sliderValue = null) {
		const size = parseInt(sliderValue || Settings.get(`${this.#settingPrefix}.toolbarFontSize`));
		const selector = "span.etv, .vh-order-success, .vh-order-failed";
		const elements = (DOMElem || document).querySelectorAll(selector);
		elements.forEach((elem) => {
			elem.style.fontSize = size + "px";
		});
	};
}

export { TileSizer };
