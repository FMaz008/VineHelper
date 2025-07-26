import { Logger } from "/scripts/core/utils/Logger.js";
var logger = new Logger();

import { SettingsMgr } from "/scripts/core/services/SettingsMgrCompat.js";
var Settings = new SettingsMgr();

// Lazy-load TitleDebugLogger only when debug is enabled
let titleDebugger = null;
const getTitleDebugger = async () => {
	if (!titleDebugger) {
		const { TitleDebugLogger } = await import("/scripts/ui/components/TitleDebugLogger.js");
		titleDebugger = TitleDebugLogger.getInstance();
	}
	return titleDebugger;
};

import { Environment } from "/scripts/core/services/Environment.js";
var env = new Environment();

import { Internationalization } from "/scripts/core/services/Internationalization.js";
var i13n = new Internationalization();

import { CryptoKeys } from "/scripts/core/utils/CryptoKeys.js";
var cryptoKeys = new CryptoKeys();
import { HiddenListMgr } from "/scripts/core/services/HiddenListMgr.js";
var HiddenList = new HiddenListMgr();

import { Item } from "/scripts/core/models/Item.js";

import { ModalMgr } from "/scripts/ui/controllers/ModalMgr.js";
import { StyleUtils } from "/scripts/ui/utils/StyleUtils.js";
var modalMgr = new ModalMgr();

import { Template } from "/scripts/core/utils/Template.js";
var Tpl = new Template();

import { compile as compileKeywords, compileKeywordObjects } from "../../core/utils/KeywordCompiler.js";
import { findMatch, getMatchedKeyword } from "../../core/utils/KeywordMatcher.js";
import { YMDHiStoISODate } from "/scripts/core/utils/DateHelper.js";
import { getTileByAsin, updateTileCounts } from "/scripts/ui/components/Grid.js";
import { unescapeHTML, escapeHTML } from "/scripts/core/utils/StringHelper.js";
import { clickDynamicSeeDetailsButton, drawButton } from "/scripts/core/utils/DynamicModalHelper.js";

import "/scripts/vendor/canvas-confetti/dist/confetti.browser.js";

class Tile {
	#tileDOM;
	#grid;
	#toolbar;

	#asin;
	#isPinned = false;
	#orderSuccess = 0;
	#orderFailed = 0;
	#orderUnavailable = false;
	#title = null;
	#thumbnailUrl = null;
	#variants = [];
	#eventListeners = []; // Track event listeners for cleanup
	#isAddingVariantButton = false; // Flag to prevent duplicate button creation

	constructor(obj, gridInstance) {
		this.#tileDOM = obj;
		this.#grid = gridInstance;
		this.#toolbar = null;

		// Extract ASIN early for logging
		const asinElement = this.#tileDOM.querySelector("div[data-asin]");
		if (asinElement) {
			this.#asin = asinElement.dataset.asin;
		}

		// Log tile creation for memory debugging
		if (window.MEMORY_DEBUGGER && Settings.get("general.debugMemory")) {
			console.log(`🏗️ Creating tile for ASIN: ${this.#asin}`);
		}
		this.#asin = this.#findasin();
		this.#orderSuccess = 0;
		this.#orderFailed = 0;

		// Check if ASIN extraction failed
		if (!this.#asin) {
			logger.add("WARNING: Creating Tile with null ASIN - tile will have limited functionality");
			console.warn("VineHelper: Tile created without ASIN", obj);
			// Mark the tile DOM to indicate it has no ASIN
			this.#tileDOM.classList.add("vh-no-asin");
			this.#tileDOM.dataset.vhNoAsin = "true";
		}

		logger.add("Creating Tile: " + this.#asin + " to grid: " + gridInstance?.getId());

		//Add the tile to the grid even if ASIN extraction failed
		//The tile might still have an ASIN in the DOM that we can use
		if (gridInstance !== null) {
			this.#grid.addTile(this);
		}
	}

	//#################
	//## Private method
	#findasin() {
		try {
			return getAsinFromDom(this.#tileDOM);
		} catch (e) {
			logger.add("Error finding ASIN: " + e.message);
			return null;
		}
	}

	//#################
	//## Public methods

	async addVariant(asin, title, etv) {
		// Check if variant button already exists in DOM
		const existingVariantBtn = this.#tileDOM.querySelector(".vh-btn-variants");

		// Only add button if it doesn't exist and we're not already adding one
		if (!existingVariantBtn && !this.#isAddingVariantButton) {
			this.#isAddingVariantButton = true;
			try {
				await this.#addVariantButton();
			} finally {
				this.#isAddingVariantButton = false;
			}
		}

		//Check if the variant already exists
		if (this.#variants.find((variant) => variant.asin === asin)) {
			return;
		}
		this.#variants.push({ asin, title, etv });

		// Update the count after adding the variant
		this.updateVariantCount();
	}

	getVariants() {
		return this.#variants;
	}

	getVariant(asin) {
		return this.#variants.find((variant) => variant.asin === asin);
	}

	updateVariantCount() {
		const span = this.getDOM().querySelector(".vh-btn-variants-count");
		if (span) {
			span.textContent = this.#variants.length;
		}
	}

	async #addVariantButton() {
		//Insert a span to contain both buttons
		const span = this.getDOM().querySelector(".vh-btn-container");

		// Check if the container exists before trying to append
		if (!span) {
			logger.add(`TILE: Cannot add variant button - .vh-btn-container not found for ASIN: ${this.#asin}`);
			return;
		}

		// Check if variant button already exists
		if (span.querySelector(".vh-btn-variants")) {
			// Variant button already exists, don't add another one
			return;
		}

		//Create the drop down button
		let prom = await Tpl.loadFile("scripts/ui/templates/btn_show_variants.html");
		let content = Tpl.render(prom, true);

		//Insert the content into the span
		span.appendChild(content);

		//Add data-recommendation-id to the buy now button
		const btnShowVariants = span.querySelector(".vh-btn-variants");
		if (!btnShowVariants) {
			logger.add(`TILE: Cannot find .vh-btn-variants button for ASIN: ${this.#asin}`);
			return;
		}

		if (this.#asin) {
			btnShowVariants.dataset.asin = this.#asin;
		}

		//If using darktheme, invert the icon's color
		if (Settings.get("thorvarium.darktheme")) {
			const indicatorIcon = btnShowVariants.querySelector(".vh-indicator-icon");
			if (indicatorIcon) {
				indicatorIcon.style.filter = "invert(1)";
			}
		}

		//Add event listener to the buy now button
		const clickHandler = this.btnShowVariantsClick.bind(this);
		btnShowVariants.addEventListener("click", clickHandler);

		// Track this listener for cleanup
		this.#eventListeners.push({ element: btnShowVariants, event: "click", handler: clickHandler });

		// Log for memory debugging
		if (window.MEMORY_DEBUGGER && Settings.get("general.debugMemory")) {
			console.log(`🎯 Added variant button click listener for ASIN: ${this.#asin}`);
		}
	}

	async btnShowVariantsClick(event) {
		event.preventDefault();
		event.stopPropagation(); // Prevent event from bubbling up to NotificationMonitor

		//Find the asin from the data-asin attribute
		const asin = this.#asin;

		// ### Display a modal listing all the variants
		let m = modalMgr.newModal("item-variants-" + asin);
		m.title = "Variants for item #" + asin;
		m.style = "min-width: 600px;";
		m.content = `<img src="${this.getThumbnail()}" alt="Thumbnail" style="width: 100px; height: 100px;float: left;margin-right: 10px;margin-bottom: 10px;" />`;
		m.content += `<br />${this.getTitle()}<br /><br /><table class="vh-table-variants">`;
		m.content += `<tr><th>Variant info</th><th>ETV</th><th>Action</th></tr>`;
		//Sort the variants by title
		this.#variants.sort((a, b) => a.title.localeCompare(b.title));
		for (let variant of this.#variants) {
			m.content += `<tr id="vh-variant-${variant.asin}"><td>`;
			try {
				const json = JSON.parse(variant.title);
				for (let key in json) {
					m.content += `<strong>${key}:</strong> ${json[key]}<br />`;
				}
			} catch (e) {
				m.content += `(No info available)<br />`;
			}
			m.content += `</td><td width="50px" class="etv">${variant.etv === null ? "" : variant.etv}</td><td width="150px">`;
			m.content += `<a href="#" class="vh-link-variant" data-asin="${variant.asin}">View ${variant.asin}</a>`;
			m.content += `</td></tr>`;
		}
		m.content += `</table>`;
		await m.show();

		//Add event listener to the links
		const links = document.querySelectorAll(`#modal-item-variants-${asin} .vh-link-variant`);
		for (let link of links) {
			const clickHandler = (event) => {
				event.preventDefault();
				//Close the modal
				m.close();

				const variantAsin = link.dataset.asin;
				const queueNames = {
					VINE_FOR_ALL: "encore",
					VENDOR_VINE_FOR_ALL: "last_chance",
					VENDOR_TARGETED: "potluck",
				};

				//Find the main See Details button
				const seeDetails = this.#tileDOM.querySelector(".vvp-details-btn input, .vvp-details-btn-mobile input");
				const queue = queueNames[seeDetails.dataset.recommendationType];

				//Generate a See Details button
				//Extract enrollment guid from recommendationId
				const recommendationId = seeDetails.dataset.recommendationId;
				const enrollmentGuid = recommendationId.split("#vine.enrollment.")[1];

				const item = new Item({
					asin: seeDetails.dataset.asin,
					queue: queue,
					is_parent_asin: false,
					enrollment_guid: enrollmentGuid,
					is_pre_release: seeDetails.dataset.isPreRelease,
				});

				drawButton(item, variantAsin);
				clickDynamicSeeDetailsButton(variantAsin);
			};
			link.addEventListener("click", clickHandler);

			// Track this listener for cleanup
			this.#eventListeners.push({ element: link, event: "click", handler: clickHandler });
		}

		// ### Get the unavailable status for the variant items
		const data = {
			api_version: 5,
			app_version: env.data.appVersion,
			country: i13n.getCountryCode(),
			uuid: Settings.get("general.uuid", false),
			fid: Settings.get("general.fingerprint.id", false),
			action: "get_variants_info",
			items: this.#variants.map((variant) => variant.asin),
		};
		const s = await cryptoKeys.signData(data);
		data.s = s;
		data.pk = await cryptoKeys.getExportedPublicKey();

		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		};
		fetch(env.getAPIUrl(), options)
			.then((response) => response.json())
			.then(async function (response) {
				for (let variant of response.items) {
					const row = document.querySelector(`#vh-variant-${variant.asin}`);
					if (row) {
						if (variant.unavailable == 1) {
							row.style.textDecoration = "line-through";
						}
						if (variant.etv) {
							const etv = row.querySelector(".etv");
							if (etv) {
								etv.textContent = variant.etv;
							}
						}
					}
				}
			});
	}

	isPinned() {
		return this.#isPinned;
	}

	setPinned(isPinned) {
		this.#isPinned = isPinned;

		if (this.#asin) {
			const pinIcon = this.#tileDOM.querySelector("#vh-pin-icon-" + this.#asin);
			if (pinIcon) {
				pinIcon.classList.toggle("vh-icon-pin", !isPinned);
				pinIcon.classList.toggle("vh-icon-unpin", isPinned);
			}
		}
	}

	async animateVanish() {
		const defaultOpacity = window.getComputedStyle(this.#tileDOM).opacity;

		// Animate opacity to 0 (hide)
		await animateOpacity(this.#tileDOM, 0, 150);

		// Reset styles
		this.#tileDOM.style.opacity = defaultOpacity;
		this.#tileDOM.style.height = "100%";
	}

	setToolbar = function (toolbarInstance) {
		this.#toolbar = toolbarInstance;
	};
	getToolbar() {
		return this.#toolbar;
	}

	setOrders(success, failed) {
		const successElement = this.#tileDOM.querySelector(".vh-order-success");
		const failedElement = this.#tileDOM.querySelector(".vh-order-failed");

		if (successElement) {
			successElement.textContent = success;
		}
		if (failedElement) {
			failedElement.textContent = failed;
		}

		this.#orderSuccess = success;
		this.#orderFailed = failed;
	}

	setUnavailable(orderUnavailable) {
		this.#orderUnavailable = orderUnavailable;
	}

	getUnavailable() {
		return this.#orderUnavailable;
	}

	getOrderSuccess() {
		return this.#orderSuccess;
	}
	getOrderFailed() {
		return this.#orderFailed;
	}

	wasOrdered() {
		return this.#orderSuccess > 0 || this.#orderFailed > 0;
	}

	getStatus() {
		if (Settings.get("unavailableTab.active")) {
			if (this.#orderSuccess > 0 && this.#orderSuccess > this.#orderFailed)
				return env.data.NOT_DISCARDED_ORDER_SUCCESS;

			if (this.#orderFailed > 0 && this.#orderFailed > this.#orderSuccess) return env.data.DISCARDED_ORDER_FAILED;
		}
		return env.data.NOT_DISCARDED;
	}

	getAsin() {
		return this.#asin;
	}

	getDOM() {
		return this.#tileDOM;
	}

	getGrid() {
		return this.#grid;
	}

	getGridId() {
		return this.#grid.getId();
	}
	getTitle() {
		if (this.#title == null) {
			this.#title = getTitleFromDom(this.#tileDOM);
			// Debug logging
			const settings = new SettingsMgr();
			if (settings.get("general.debugKeywords")) {
				console.log("[Tile] Title retrieved from DOM:", {
					asin: this.getAsin(),
					title: this.#title.substring(0, 100) + (this.#title.length > 100 ? "..." : ""),
					domElement: this.#tileDOM,
				});
			}
			// Title debug logging - only if debug is enabled
			if (Settings.get("general.debugTitleDisplay")) {
				getTitleDebugger().then((logger) => logger.logDOMExtraction(this.#asin, "getTitle", this.#title));
			}
		}
		return this.#title;
	}

	getThumbnail() {
		if (this.#thumbnailUrl == null) {
			this.#thumbnailUrl = getThumbnailURLFromDom(this.#tileDOM);
		}
		return this.#thumbnailUrl;
	}

	markAsDiscovered() {
		const container = this.#tileDOM.querySelector(".vh-img-container");

		const newCorner = document.createElement("div");
		newCorner.classList.add("vh-new-corner-discovered");
		//Add a span into the div
		const span = document.createElement("span");
		span.innerHTML = "FIRST<br>DISCOVERY";
		newCorner.appendChild(span);

		//Insert newCorner as the first child of the container
		container.insertBefore(newCorner, container.firstChild);

		if (Settings.get("general.discoveryFirst")) {
			logger.add("Tile: markAsDiscovered: discoveryFirst");
			//Move the highlighted item to the top of the grid
			this.getGrid().getDOM().insertBefore(this.getDOM(), this.getGrid().getDOM().firstChild);
		}

		//Confetti animation
		//Wait 1 seconds for the item to take their final position
		setTimeout(() => {
			this.explodeConfettiFromDiv(this.getDOM());
		}, 1000);
	}

	explodeConfettiFromDiv(div) {
		if (!div) return;

		const rect = div.getBoundingClientRect();

		if (rect.top == 0 && rect.left == 0) {
			return; //div not visible.
		}

		// Create confetti from three sides
		const positions = [
			// Left side
			{ x: rect.left / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: rect.left / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
			{ x: rect.left / window.innerWidth, y: rect.bottom / window.innerHeight },
			// Top side
			{ x: (rect.left + rect.width / 4) / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: (rect.left + rect.width / 2) / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: (rect.left + (rect.width * 3) / 4) / window.innerWidth, y: rect.top / window.innerHeight },
			// Right side
			{ x: rect.right / window.innerWidth, y: rect.top / window.innerHeight },
			{ x: rect.right / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight },
			{ x: rect.right / window.innerWidth, y: rect.bottom / window.innerHeight },
		];

		positions.forEach((pos) => {
			confetti({
				particleCount: 15, // Reduced particle count per origin point
				spread: 45,
				startVelocity: 15, // Reduced velocity for shorter distance
				decay: 0.9, // Faster decay
				gravity: 0.8, // Reduced gravity
				ticks: 100, // Controls animation duration (~500ms)
				origin: pos,
				colors: ["#ff0", "#ff4500", "#ff1493", "#00ffff", "#00ff00"],
				scalar: 0.8, // Smaller particles
				drift: 0, // No sideways drift
				disableForReducedMotion: true,
			});
		});
	}

	setDateAdded(timenow, mysqlDate) {
		if (mysqlDate == undefined || !Settings.get("general.displayFirstSeen")) {
			return false;
		}

		let serverCurrentDate = YMDHiStoISODate(timenow);
		let itemDateAdded = YMDHiStoISODate(mysqlDate);
		let bookmarkDate = new Date(Settings.get("general.bookmarkDate"));
		if (isNaN(serverCurrentDate.getTime()) || isNaN(itemDateAdded.getTime())) {
			logger.add(
				"! Time firstseen wrong: serverCurrentDate:" +
					serverCurrentDate +
					" itemDateAdded:" +
					itemDateAdded +
					"preformated current time: " +
					timenow +
					"preformatted item time" +
					mysqlDate
			);
			return;
		}
		//Add the data-date attribute to the tile
		// Convert to local time and store in dataset
		this.#tileDOM.dataset.date = new Date(itemDateAdded).toLocaleString();

		let textDate = timeSince(serverCurrentDate, itemDateAdded);
		const dateAddedMessage = `${textDate} ago`;

		let dateAddedDiv = document.createElement("div");
		dateAddedDiv.classList.add("vh-date-added"); // Add the class
		dateAddedDiv.textContent = dateAddedMessage;

		// Find the container and append the new div
		const container = this.#tileDOM.querySelector(".vh-img-container");
		if (container) {
			container.appendChild(dateAddedDiv);
		} else {
			logger.add(`TILE: Cannot add date - .vh-img-container not found for ASIN: ${this.#asin}`);
		}

		//Highlight the tile background if the bookmark date is in the past
		if (
			Settings.get("general.bookmark") &&
			itemDateAdded > bookmarkDate &&
			Settings.get("general.bookmarkDate") != 0
		) {
			logger.add("TILE: The item is more recent than the time marker, highlight its toolbar.");
			const statusContainer = this.#tileDOM.querySelector(".vh-status-container");
			if (statusContainer) {
				statusContainer.style.backgroundColor = Settings.get("general.bookmarkColor");
			}
			this.#tileDOM.classList.add("vh-new-item-highlight");
		}
	}

	async initiateTile() {
		// Check if blur should be applied based on pre-computed blur keyword match
		// The blur keyword matching is done in NewItemStreamProcessing.js
		// dataset.blurkw contains the actual blur keyword if matched, or empty/undefined if not
		const shouldBlur = this.#tileDOM.dataset.blurkw && this.#tileDOM.dataset.blurkw !== "false";

		// Debug logging for blur keyword application
		if (Settings.get("general.debugKeywords")) {
			console.log("[Tile.initiateTile] Applying blur based on pre-computed match", {
				asin: this.getAsin(),
				title: this.getTitle(),
				shouldBlur: shouldBlur,
				dataBlurKw: this.#tileDOM.dataset.blurkw,
			});
		}

		if (Settings.isPremiumUser() && shouldBlur) {
			// Get the blur keyword from the DOM data (set during stream processing)
			const blurKeyword = this.#tileDOM.dataset.blurkw || "blur keyword";

			logger.add("TILE: The item matches blur keyword, applying blur");
			const img = this.#tileDOM.querySelector("img");
			if (img) {
				if (Settings.get("general.unblurImageOnHover")) {
					img.classList.add("dynamic-blur");
				} else {
					img.classList.add("blur");
				}
			}
			this.#tileDOM.querySelector(".vvp-item-product-title-container")?.classList.add("dynamic-blur");
			this.#tileDOM.dataset.blurredKeyword = escapeHTML(blurKeyword);
		} else {
			this.#tileDOM.dataset.blurredKeyword = "";
		}

		//Unescape titles and ensure they remain visible
		const truncateFull = this.getDOM().querySelector(".a-truncate-full");
		const truncateCut = this.getDOM().querySelector(".a-truncate-cut");

		// Log initial tile creation - only if debug is enabled
		if (Settings.get("general.debugTitleDisplay")) {
			getTitleDebugger().then((logger) =>
				logger.logTileCreation(
					this.#asin,
					truncateFull || truncateCut,
					truncateFull?.innerText || truncateCut?.innerText
				)
			);
		}

		// Get the title text - try multiple sources
		let titleText = truncateFull?.innerText || truncateCut?.innerText;

		// If both are empty, try to get from the link's data-tooltip
		if (!titleText) {
			const linkElement = this.getDOM().querySelector(".a-link-normal");
			titleText = linkElement?.getAttribute("data-tooltip") || "";
			if (Settings.get("general.debugTitleDisplay")) {
				getTitleDebugger().then((logger) =>
					logger.logDOMExtraction(this.#asin, "data-tooltip fallback", titleText)
				);
			}
		}

		// If still empty, get from the tile's stored title
		if (!titleText) {
			titleText = this.getTitle();
			if (Settings.get("general.debugTitleDisplay")) {
				getTitleDebugger().then((logger) =>
					logger.logDOMExtraction(this.#asin, "getTitle fallback", titleText)
				);
			}
		}

		// Apply unescaped text to both spans
		if (titleText) {
			const unescapedText = unescapeHTML(unescapeHTML(titleText));

			// Set text content for both spans
			if (truncateFull) {
				truncateFull.innerText = unescapedText;
				// Ensure it stays visible by removing a-offscreen if Amazon adds it
				truncateFull.classList.remove("a-offscreen");
				if (Settings.get("general.debugTitleDisplay")) {
					getTitleDebugger().then((logger) =>
						logger.log(this.#asin, "TITLE_SET", {
							element: "truncateFull",
							text: unescapedText.substring(0, 100),
							length: unescapedText.length,
						})
					);
				}
			}
			if (truncateCut) {
				truncateCut.innerText = unescapedText;
				// Ensure it's visible
				truncateCut.style.visibility = "visible";
				truncateCut.style.display = "";
				if (Settings.get("general.debugTitleDisplay")) {
					getTitleDebugger().then((logger) =>
						logger.log(this.#asin, "TITLE_SET", {
							element: "truncateCut",
							text: unescapedText.substring(0, 100),
							length: unescapedText.length,
						})
					);
				}
			}

			// Only apply title restoration on Amazon pages where the issue occurs
			//(is this a made up problem?)
			// Skip on Notification Monitor where titles display correctly
			const isNotificationMonitor = window.location.href.includes("#monitor");
			const isAmazonVinePage = window.location.href.includes("/vine/vine-items") && !isNotificationMonitor;

			if (isAmazonVinePage) {
				// Store the original title for restoration
				this.#tileDOM.dataset.vhOriginalTitle = unescapedText;

				// Use a simpler periodic check instead of MutationObserver
				// This avoids memory leaks and is much simpler
				if (!Tile.titleRestorationInterval) {
					Tile.titleRestorationInterval = setInterval(() => {
						// Check all tiles with stored titles
						const tilesWithStoredTitles = document.querySelectorAll(
							".vvp-item-tile[data-vh-original-title]"
						);

						tilesWithStoredTitles.forEach((tileElement) => {
							const storedTitle = tileElement.dataset.vhOriginalTitle;
							if (storedTitle) {
								// Check both title elements
								const truncateFull = tileElement.querySelector(".a-truncate-full");
								const truncateCut = tileElement.querySelector(".a-truncate-cut");

								// Restore if text was cleared
								if (truncateFull && !truncateFull.innerText) {
									truncateFull.innerText = storedTitle;
									truncateFull.classList.remove("a-offscreen");

									if (Settings.get("general.debugTitleDisplay")) {
										console.log(
											`🔄 [TitleFix] Restored title for ASIN: ${tileElement.dataset.asin}`
										);
									}
								}

								if (truncateCut && !truncateCut.innerText) {
									truncateCut.innerText = storedTitle;
									truncateCut.style.visibility = "visible";
									truncateCut.style.display = "";

									if (Settings.get("general.debugTitleDisplay")) {
										console.log(
											`🔄 [TitleFix] Restored title for ASIN: ${tileElement.dataset.asin}`
										);
									}
								}
							}
						});
					}, 2000); // Check every 2 seconds

					if (Settings.get("general.debugTitleDisplay")) {
						console.log("🔄 [TitleFix] Started periodic title restoration");
					}
				}
			}
		}
		//Assign the ASIN to the tile content
		if (this.#asin) {
			this.getDOM().closest(".vvp-item-tile").dataset.asin = this.#asin;
		}
	}

	colorizeHighlight() {
		const zeroETV = this.#tileDOM.dataset.typeZeroETV === "1" && Settings.get("general.zeroETVHighlight.active");
		const highlight = this.#tileDOM.dataset.typeHighlight === "1" && Settings.get("general.highlightColor.active");
		const unknownETV =
			this.#tileDOM.dataset.typeUnknownETV === "1" && Settings.get("general.unknownETVHighlight.active");

		// Debug logging
		if (Settings.get("general.debugKeywords")) {
			console.log("[Tile] colorizeHighlight called:", {
				asin: this.#asin,
				typeHighlight: this.#tileDOM.dataset.typeHighlight,
				typeZeroETV: this.#tileDOM.dataset.typeZeroETV,
				typeUnknownETV: this.#tileDOM.dataset.typeUnknownETV,
				highlightColorActive: Settings.get("general.highlightColor.active"),
				zeroETVHighlightActive: Settings.get("general.zeroETVHighlight.active"),
				unknownETVHighlightActive: Settings.get("general.unknownETVHighlight.active"),
				willHighlight: highlight,
				willHighlightZeroETV: zeroETV,
				willHighlightUnknownETV: unknownETV,
			});
		}

		// Use StyleUtils to handle background styling
		if (zeroETV && highlight && !Settings.get("general.highlightColor.ignore0ETVhighlight")) {
			const color1 = Settings.get("general.zeroETVHighlight.color");
			const color2 = Settings.get("general.highlightColor.color");
			const gradient = StyleUtils.createStripedGradient(color1, color2);
			StyleUtils.applyBackground(this.#tileDOM, gradient, true);
		} else if (unknownETV && highlight && !Settings.get("general.highlightColor.ignoreUnknownETVhighlight")) {
			const color1 = Settings.get("general.unknownETVHighlight.color");
			const color2 = Settings.get("general.highlightColor.color");
			const gradient = StyleUtils.createStripedGradient(color1, color2);
			StyleUtils.applyBackground(this.#tileDOM, gradient, true);
		} else if (highlight) {
			StyleUtils.applyBackground(this.#tileDOM, Settings.get("general.highlightColor.color"), false);
		} else if (zeroETV) {
			StyleUtils.applyBackground(this.#tileDOM, Settings.get("general.zeroETVHighlight.color"), false);
		} else if (unknownETV) {
			StyleUtils.applyBackground(this.#tileDOM, Settings.get("general.unknownETVHighlight.color"), false);
		} else {
			// Clear any existing styling
			StyleUtils.clearBackgrounds(this.#tileDOM);
		}
	}

	async moveToGrid(g, animate = false) {
		if (g === null) {
			return false;
		}

		//If we are asking to move the tile to the same grid, don't do anything
		if (g.getId() == this.#grid.getId()) return false;

		if (animate) {
			await this.#grid.removeTileAnimate(this);
		} else {
			await this.#grid.removeTile(this); //Avoiding the await keep the method synchronous
		}

		this.#grid = g; //Update the new grid as the current one
		await this.#grid.addTile(this);

		return true;
	}

	async isHidden() {
		if (!Settings.get("hiddenTab.active") || !this.#asin) {
			return false;
		}
		return await HiddenList.isHidden(this.#asin);
	}

	async hideTile(animate = true, updateLocalStorage = true, skipHiddenListMgr = false) {
		//Add the item to the list of hidden items
		if (!this.#asin) {
			logger.add("WARNING: Cannot hide tile without ASIN");
			return;
		}

		if (!skipHiddenListMgr) {
			HiddenList.addItem(this.#asin, updateLocalStorage);
		}

		//Move the tile
		await this.moveToGrid(env.data.grid.gridHidden, animate);

		if (this.#toolbar) {
			this.#toolbar.updateVisibilityIcon();
		}

		//Refresh grid counts
		updateTileCounts();
	}

	async showTile(animate = true, updateLocalStorage = true) {
		//Remove the item from the array of hidden items
		if (!this.#asin) {
			logger.add("WARNING: Cannot show tile without ASIN");
			return;
		}

		HiddenList.removeItem(this.#asin, updateLocalStorage);

		//Move the tile
		await this.moveToGrid(env.data.grid.gridRegular, animate);

		if (this.#toolbar) {
			this.#toolbar.updateVisibilityIcon();
		}

		//Refresh grid counts
		updateTileCounts();
	}

	/**
	 * Clean up all event listeners before removing the tile
	 */
	destroy() {
		// Log cleanup for memory debugging
		if (window.MEMORY_DEBUGGER && Settings.get("general.debugMemory")) {
			console.log(
				`🧹 Cleaning up tile for ASIN: ${this.#asin}, removing ${this.#eventListeners.length} event listeners`
			);
		}

		// Remove all tracked event listeners and observers
		for (const listener of this.#eventListeners) {
			if (listener.type === "observer") {
				// Disconnect MutationObserver
				listener.instance.disconnect();
			} else {
				// Remove regular event listener
				listener.element.removeEventListener(listener.event, listener.handler);
			}
		}

		// Clear the array
		this.#eventListeners = [];

		// CRITICAL FIX: Clear the stored title from dataset to prevent memory leaks
		if (this.#tileDOM && this.#tileDOM.dataset) {
			delete this.#tileDOM.dataset.vhOriginalTitle;
		}

		// CRITICAL FIX: Clear any direct references on the tile DOM
		if (this.#tileDOM) {
			this.#tileDOM.vhTileInstance = null;
		}

		// Mark the tile as cleaned up in MemoryDebugger
		if (window.MEMORY_DEBUGGER) {
			window.MEMORY_DEBUGGER.markElementRemoved(this.#tileDOM);
		}

		// CRITICAL FIX: Clear the DOM reference to help garbage collection
		this.#tileDOM = null;

		// CRITICAL FIX: Check if shared observer should be cleaned up
		Tile.checkAndCleanupSharedObserver();
	}
}

function timeSince(timenow, date) {
	const units = [
		{ value: 31536000, unit: "year" },
		{ value: 2592000, unit: "month" },
		{ value: 86400, unit: "day" },
		{ value: 3600, unit: "hr" },
		{ value: 60, unit: "min" },
		{ value: 1, unit: "sec" },
	];

	var seconds = Math.floor((timenow - date) / 1000);
	for (const { value, unit } of units) {
		const interval = seconds / value;
		if (interval >= 1) {
			const plural = Math.floor(interval) > 1 ? "s" : "";
			return Math.floor(interval) + ` ${unit}${plural}`;
		}
	}
	return `${Math.floor(seconds)} secs`;
}

function getAsinFromDom(tileDom) {
	const seeDetailsBtn = tileDom.querySelector("input[type='submit']");
	let asin = null;
	if (seeDetailsBtn) {
		asin = seeDetailsBtn.getAttribute("data-asin");
		if (asin) {
			//logger.add("TILE: Extracted ASIN from See details button: " + asin);
			return asin;
		} else {
			// Fallback: Try to extract ASIN from data-recommendation-id attribute
			// Format: "ATVPDKIKX0DER#B0DWXBZW8K#vine.enrollment...."
			const recommendationId = tileDom.getAttribute("data-recommendation-id");
			if (recommendationId) {
				const parts = recommendationId.split("#");
				if (parts.length >= 2 && parts[1]) {
					// The ASIN is the second part
					//logger.add("TILE: Extracted ASIN from data-recommendation-id: " + parts[1]);
					return parts[1];
				}
			}
		}
	}

	//Extract the ASIN from the URL
	const url = tileDom.querySelector("a.a-link-normal")?.href;
	if (url) {
		const regex = /\/dp\/([A-Z0-9]{10})/;
		asin = url.match(regex)[1];
		if (asin) {
			//logger.add("TILE: Extracted ASIN from URL: " + asin);
			return asin;
		}
	}

	// If all methods fail, log a warning and return null instead of throwing
	logger.add("TILE: WARNING - Could not extract ASIN from tile. Tile HTML: " + tileDom.outerHTML.substring(0, 200));
	console.warn("VineHelper: Could not extract ASIN from tile", tileDom);
	return null;
}

function getTileFromDom(tileDom) {
	const asin = getAsinFromDom(tileDom);
	if (!asin) {
		logger.add("TILE: WARNING - getTileFromDom called with tile that has no ASIN");
		return null;
	}
	return getTileByAsin(asin);
}

function getTitleFromDom(tileDom) {
	let textElement = tileDom.querySelector(".a-truncate-full");
	const title = textElement ? textElement.textContent : "";

	// Debug logging
	const settings = new SettingsMgr();
	const asinElement = tileDom.querySelector("[data-asin]");
	const asin = asinElement ? asinElement.dataset.asin : "unknown";

	if (settings.get("general.debugKeywords")) {
		console.log("[getTitleFromDom] Extracting title:", {
			asin: asin,
			title: title.substring(0, 100) + (title.length > 100 ? "..." : ""),
			textElement: textElement,
			tileDom: tileDom,
		});
	}

	// Title debug logging - only if debug is enabled
	if (asin !== "unknown" && settings.get("general.debugTitleDisplay")) {
		getTitleDebugger().then((logger) => logger.logDOMExtraction(asin, "getTitleFromDom", title));
	}

	return title;
}

function getThumbnailURLFromDom(tileDom) {
	//Preload.
	let imgElement = tileDom.querySelector(".vvp-item-tile-content > img");
	let url = imgElement ? imgElement.getAttribute("src") : null;

	if (url == undefined) {
		//Post load of VH added an image container.
		imgElement = tileDom.querySelector(".vh-img-container > img");
		url = imgElement ? imgElement.getAttribute("src") : null;
	}

	return url == undefined ? null : url;
}

// Function to animate opacity
function animateOpacity(element, targetOpacity, duration) {
	return new Promise((resolve) => {
		const startOpacity = parseFloat(getComputedStyle(element).opacity);
		const opacityChange = targetOpacity - startOpacity;
		const startTime = performance.now();

		function animate(time) {
			const elapsed = time - startTime;
			const progress = Math.min(elapsed / duration, 1);
			element.style.opacity = startOpacity + opacityChange * progress;

			if (progress < 1) {
				requestAnimationFrame(animate);
			} else {
				element.style.display = "none"; // Optionally hide the element
				resolve();
			}
		}

		requestAnimationFrame(animate);
	});
}

// Add static cleanup method for the shared observer
Tile.cleanupSharedObserver = function () {
	if (Tile.titleRestorationInterval) {
		clearInterval(Tile.titleRestorationInterval);
		Tile.titleRestorationInterval = null;

		// Log cleanup if debug is enabled
		const settings = new SettingsMgr();
		if (settings.get("general.debugTitleDisplay")) {
			console.log("🧹 [TitleFix] Shared MutationObserver disconnected");
		}
	}
};

// CRITICAL FIX: Add method to check if shared observer should be cleaned up
Tile.checkAndCleanupSharedObserver = function () {
	if (Tile.titleRestorationInterval) {
		// Check if there are any tiles left in the document that might need the observer
		const remainingTiles = document.querySelectorAll(".vvp-item-tile[data-vh-original-title]");
		if (remainingTiles.length === 0) {
			console.log("🧹 [TitleFix] No tiles with stored titles remain, cleaning up interval");
			clearInterval(Tile.titleRestorationInterval);
			Tile.titleRestorationInterval = null;
		}
	}
};

export { Tile, getTileFromDom, getAsinFromDom };
