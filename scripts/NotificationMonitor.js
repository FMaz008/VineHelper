import { NotificationsSoundPlayer } from "./NotificationsSoundPlayer.js";
var SoundPlayer = new NotificationsSoundPlayer();

import { keywordMatch } from "./service_worker/keywordMatch.js";

//const TYPE_SHOW_ALL = -1;
const TYPE_REGULAR = 0;
const TYPE_ZEROETV = 1;
const TYPE_HIGHLIGHT = 2;
const TYPE_HIGHLIGHT_OR_ZEROETV = 9;

class NotificationMonitor {
	#feedPaused;
	#feedPausedAmountStored;
	#waitTimer; //Timer which wait a short delay to see if anything new is about to happen
	#imageUrls;
	async initialize() {
		this.#imageUrls = new Set();
		this.#feedPausedAmountStored = 0;

		//Remove the existing items.
		document.getElementById("vvp-items-grid").innerHTML = "";

		//Remove the item count
		document.querySelector("#vvp-items-grid-container>p")?.remove();

		//Remove the navigation
		document.querySelector("#vvp-items-grid-container > div[role=navigation]")?.remove();

		//Remove the categories
		document.querySelector("#vvp-browse-nodes-container")?.remove();

		//Remove the header
		document.querySelector("#vvp-header")?.remove();

		//Remove the search bar
		document.querySelector(".vvp-items-button-and-search-container")?.remove();

		//Remove the nagivation tabs:
		document.querySelector("ul.a-tabs")?.remove();

		this.#updateTabTitle();

		//Insert the header
		const parentContainer = document.querySelector("div.vvp-tab-content");
		const mainContainer = document.querySelector("div.vvp-items-container");
		const topContainer = document.querySelector("div#vvp-items-grid-container");
		const itemContainer = document.querySelector("div#vvp-items-grid");

		let prom2 = await Tpl.loadFile("view/notification_monitor_header.html");
		const header = Tpl.render(prom2, true);
		parentContainer.insertBefore(header, mainContainer);

		//Insert the VH tab container for the items even if there is no tabs
		const tabContainer = document.createElement("div");
		tabContainer.id = "vh-tabs";
		itemContainer.classList.add("tab-grid");

		if (
			Settings.get("thorvarium.mobileios") ||
			Settings.get("thorvarium.mobileandroid") ||
			Settings.get("thorvarium.smallItems")
		) {
			tabContainer.classList.add("smallitems");
		}

		//Assign the tab to the top container
		topContainer.appendChild(tabContainer);

		//Assign the item container to the tab container
		tabContainer.appendChild(itemContainer);

		//Service worker status
		this.#updateServiceWorkerStatus();

		//Obtain the status of the WebSocket connection.
		browser.runtime.sendMessage({
			type: "wsStatus",
		});

		document.getElementById("date_loaded").innerText = new Date().toLocaleString(I13n.getLocale());

		//Bind fetch-last-100 button
		const btnLast100 = document.getElementById("fetch-last-100");
		btnLast100.addEventListener("click", (event) => {
			browser.runtime.sendMessage({
				type: "fetchLast100Items",
			});
		});

		//Bind Pause Feed button
		this.#feedPaused = false;
		const btnPauseFeed = document.getElementById("pauseFeed");
		btnPauseFeed.addEventListener("click", (event) => {
			this.#feedPaused = !this.#feedPaused;
			if (this.#feedPaused) {
				this.#feedPausedAmountStored = 0;
				document.getElementById("pauseFeed").value = "Resume Feed (0)";
			} else {
				document.getElementById("pauseFeed").value = "Pause & Buffer Feed";
				document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
					if (node.dataset.feedPaused == "true") {
						node.style.display = "flex";
						node.dataset.feedPaused = "false";
					}
				});
			}
		});

		//Bind the event when changing the filter
		const filterType = document.querySelector("select[name='filter-type']");
		filterType.addEventListener("change", (event) => {
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this.#updateTabTitle();
		});
		const filterQueue = document.querySelector("select[name='filter-queue']");
		filterQueue.addEventListener("change", (event) => {
			//Display a specific type of notifications only
			document.querySelectorAll(".vvp-item-tile").forEach((node, key, parent) => {
				this.#processNotificationFiltering(node);
			});
			this.#updateTabTitle();
		});
	}

	async addTileInGrid(
		asin,
		queue,
		date,
		title,
		img_url,
		is_parent_asin,
		enrollment_guid,
		etv_min,
		etv_max,
		reason,
		highlightKW,
		KWsMatch,
		blurKW,
		BlurKWsMatch
	) {
		if (!asin) {
			return false;
		}

		//Check if the de-duplicate image setting is on, if so, do not add items
		//for which an item with the same thumbnail already exist.
		if (Settings.get("notification.monitor.hideDuplicateThumbnail")) {
			if (this.#imageUrls.has(img_url)) {
				return false; //The image already exist, do not add the item
			} else {
				this.#imageUrls.add(img_url);
			}
		}

		const recommendationType = getRecommendationTypeFromQueue(queue); //grid.js
		const recommendationId = generateRecommendationString(recommendationType, asin, enrollment_guid); //grid.js

		//If the notification already exist, remove it to avoid duplicates
		document.getElementById("vh-notification-" + asin)?.remove();

		//Add the notification
		let templateFile;
		if (Settings.get("general.listView")) {
			templateFile = "tile_listview.html";
		} else {
			templateFile = "tile_gridview.html";
		}

		let prom2 = await Tpl.loadFile("view/" + templateFile);
		Tpl.setVar("id", asin);
		Tpl.setVar("domain", I13n.getDomainTLD());
		Tpl.setVar("img_url", img_url);
		Tpl.setVar("asin", asin);
		Tpl.setVar("date", this.#formatDate(date));
		Tpl.setVar("feedPaused", this.#feedPaused);
		Tpl.setVar("queue", queue);
		Tpl.setVar("description", title);
		Tpl.setVar("reason", reason);
		Tpl.setVar("highlightKW", highlightKW);
		Tpl.setVar("blurKW", blurKW);
		Tpl.setVar("is_parent_asin", is_parent_asin);
		Tpl.setVar("enrollment_guid", enrollment_guid);
		Tpl.setVar("recommendationType", recommendationType);
		Tpl.setVar("recommendationId", recommendationId);
		Tpl.setIf("announce", Settings.get("discord.active") && Settings.get("discord.guid", false) != null);
		Tpl.setIf("pinned", Settings.get("pinnedTab.active"));
		Tpl.setIf("variant", Settings.isPremiumUser() && Settings.get("general.displayVariantIcon") && is_parent_asin);

		let tileDOM = Tpl.render(prom2, true);
		const container = document.querySelector("#vvp-items-grid");
		container.insertBefore(tileDOM, container.firstChild);

		//Set the width according to the tileSize
		tileDOM.querySelector(".vvp-item-tile-content").style.width =
			parseInt(Settings.get("general.tileSize.width")) - 8 + "px";

		//If the feed is paused, up the counter and rename the Resume button
		if (this.#feedPaused) {
			this.#feedPausedAmountStored++;
			document.getElementById("pauseFeed").value = `Resume Feed (${this.#feedPausedAmountStored})`;
		}

		//If we received ETV data (ie: Fetch last 100), process them
		if (etv_min != null && etv_max != null) {
			//Set the ETV but take no action on it
			this.setETV(asin, etv_min, false); //Don't process potential 0etv, just set the ETV
			this.setETV(asin, etv_max, false); //Don't process potential 0etv, just set the ETV

			//We found a zero ETV item, but we don't want to play a sound just yet
			if (parseFloat(etv_min) == 0) {
				this.#zeroETVItemFound(asin, false); //Ok now process 0etv, but no sound
			}
		} else {
			//The ETV is not known
			const brendaAnnounce = tileDOM.querySelector("#vh-announce-link-" + asin);
			if (brendaAnnounce) {
				brendaAnnounce.style.visibility = "hidden";
			}
		}

		//Process the item according to the notification type (highlight > 0etv > regular)
		//This is what determine & trigger what sound effect to play
		if (KWsMatch) {
			this.#highlightedItemFound(asin, true); //Play the highlight sound
		} else if (parseFloat(etv_min) == 0) {
			this.#zeroETVItemFound(asin, true); //Play the zeroETV sound
		} else {
			this.#regularItemFound(asin, true); //Play the regular sound
		}

		//Process the bluring
		if (BlurKWsMatch) {
			this.#blurItemFound(asin);
		}

		//Update the most recent date
		document.getElementById("date_most_recent_item").innerText = this.#formatDate(date);

		//Apply the filters
		this.#processNotificationFiltering(tileDOM);

		//Update the tab title:
		//User a timer to avoid the Fetch Last 100 to call this 100 times, which slow things down.
		clearTimeout(this.#waitTimer);
		this.#waitTimer = null;
		this.#waitTimer = setTimeout(() => {
			this.#updateTabTitle();
		}, 100);

		// Add new click listener for the report button
		document.querySelector("#vh-report-link-" + asin).addEventListener("click", this.#handleReportClick);

		//Add new click listener for Brenda announce:
		if (Settings.get("discord.active") && Settings.get("discord.guid", false) != null) {
			const announce = document.querySelector("#vh-announce-link-" + asin);
			announce.addEventListener("click", this.#handleBrendaClick);
		}

		//Add new click listener for the pinned button
		if (Settings.get("pinnedTab.active")) {
			const pinIcon = document.querySelector("#vh-pin-link-" + asin);
			pinIcon.addEventListener("click", this.#handlePinClick);
		}

		//Add new click listener for the hide button
		const hideIcon = document.querySelector("#vh-hide-link-" + asin);
		hideIcon.addEventListener("click", this.#handleHideClick);

		//Add new click listener for the technical details button
		const detailsIcon = document.querySelector("#vh-reason-link-" + asin);
		detailsIcon.addEventListener("click", this.#handleDetailsClick);

		//Add the click listener for the See Details button
		if (Settings.get("notification.monitor.openLinksInNewTab") == "1") {
			//Deactivate Vine click handling
			const btnContainer = document.querySelector(`#vh-notification-${asin} .vvp-details-btn`);
			btnContainer.classList.remove("vvp-details-btn");

			//Bind the button's click
			const seeDetailsBtn = document.querySelector(`#vh-notification-${asin} .a-button-primary input`);
			seeDetailsBtn.addEventListener("click", () => {
				window.open(
					`https://www.amazon.${I13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${is_parent_asin ? "true" : "false"};${enrollment_guid}`,
					"_blank"
				);
			});
		}

		//Autotruncate the items if there are too many
		this.#autoTruncate();

		return tileDOM; //Return the DOM element for the tile.
	}

	async setETV(asin, etv, processAsZeroETVFound = true) {
		const notif = this.#getNotificationByASIN(asin);

		if (!notif) {
			return false;
		}

		const etvObj = notif.querySelector("div.etv");
		const etvTxt = etvObj.querySelector("span.etv");
		const brendaAnnounce = notif.querySelector("#vh-announce-link-" + asin);

		//Update the ETV value in the hidden fields
		let oldMaxValue = etvObj.dataset.etvMax; //Used to determine if a new 0ETV was found
		if (etvObj.dataset.etvMin == "" || etv < etvObj.dataset.etvMin) {
			etvObj.dataset.etvMin = etv;
		}

		if (etvObj.dataset.etvMax == "" || etv > etvObj.dataset.etvMax) {
			etvObj.dataset.etvMax = etv;
		}

		//Display for formatted ETV in the toolbar
		if (etvObj.dataset.etvMin != "" && etvObj.dataset.etvMax != "") {
			etvObj.style.visibility = "visible";
			if (etvObj.dataset.etvMin == etvObj.dataset.etvMax) {
				etvTxt.innerText = this.#formatETV(etvObj.dataset.etvMin);
			} else {
				etvTxt.innerText =
					this.#formatETV(etvObj.dataset.etvMin) + "-" + this.#formatETV(etvObj.dataset.etvMax);
			}
		}

		//If Brenda is enabled, toggle the button display according to wether the ETV is known.
		if (brendaAnnounce) {
			if (etvObj.dataset.etvMin == "") {
				brendaAnnounce.style.visibility = "hidden";
			} else {
				brendaAnnounce.style.visibility = "visible";
			}
		}

		//If a new ETV came in, we want to check if the item now match a keywords with an ETV condition.
		//Check if the item is highlighted
		//If the item is already highlighted, we don't need to check if we need to highlight it or hide it.
		//Skip the 0 ETV processing too.
		let skip0ETV = notif.dataset.type == TYPE_HIGHLIGHT;
		if (!skip0ETV && processAsZeroETVFound) {
			//No need to re-highlight if the item is already highlighted.
			//We don't want to highlight an item that is getting its ETV set initially (processAsZeroETVFound==false) before another pass of highlighting will be done shortly after.
			const title = notif.querySelector(".a-truncate-full").innerText;
			if (title) {
				//Check if we need to highlight the item
				const val = await keywordMatch(
					Settings.get("general.highlightKeywords"),
					title,
					etvObj.dataset.etvMin,
					etvObj.dataset.etvMax
				);

				if (val !== false) {
					//We got a keyword match, highlight the item
					skip0ETV = true;
					this.#highlightedItemFound(asin, true);
				} else {
					//Check if we need to hide the item
					const val2 = await keywordMatch(
						Settings.get("general.hideKeywords"),
						title,
						etvObj.dataset.etvMin,
						etvObj.dataset.etvMax
					);
					if (val2 !== false) {
						//Remove (permanently "hide") the tile
						notif.remove();
						this.#updateTabTitle(); //Update the tab counter
						skip0ETV = true;
					}
				}
			}
		}

		//Check if the item is a 0ETV
		if (skip0ETV === false) {
			if (processAsZeroETVFound && oldMaxValue == "" && parseFloat(etvObj.dataset.etvMin) == 0) {
				this.#zeroETVItemFound(asin, true);
			}
		}
	}

	setWebSocketStatus(status) {
		const icon = document.querySelector("#statusWS div.vh-switch-32");
		const description = document.querySelector("#statusWS .description");
		if (status) {
			icon.classList.remove("vh-icon-switch-off");
			icon.classList.add("vh-icon-switch-on");
			description.innerText = "Listening for notifications...";
		} else {
			icon.classList.remove("vh-icon-switch-on");
			icon.classList.add("vh-icon-switch-off");
			description.innerText = "Not connected. Retrying in 30 sec...";
		}
	}

	#updateServiceWorkerStatus() {
		if (!Settings.get("notification.active")) {
			this.#setServiceWorkerStatus(false, "You need to enable the notifications in the settings.");
		} else if (I13n.getCountryCode() === null) {
			this.#setServiceWorkerStatus(
				false,
				"Your country has not been detected, ensure to load a vine page first."
			);
		} else if (I13n.getDomainTLD() === null) {
			this.#setServiceWorkerStatus(
				false,
				"No valid country found. You current country is detected as: '" +
					I13n.getCountryCode() +
					"', which is not currently supported by Vine Helper. Reach out so we can add it!"
			);
		} else if (Settings.get("notification.active")) {
			this.#setServiceWorkerStatus(true, "Working.");
		}
	}

	#setServiceWorkerStatus(status, desc = "") {
		const icon = document.querySelector("#statusSW div.vh-switch-32");
		const description = document.querySelector("#statusSW .description");

		if (status) {
			icon.classList.remove("vh-icon-switch-off");
			icon.classList.add("vh-icon-switch-on");
		} else {
			icon.classList.remove("vh-icon-switch-on");
			icon.classList.add("vh-icon-switch-off");
		}

		description.textContent = desc;
	}

	#zeroETVItemFound(asin, playSoundEffect = true) {
		const notif = this.#getNotificationByASIN(asin);

		if (!notif) {
			return false;
		}

		//Play the zero ETV sound effect
		if (playSoundEffect) {
			SoundPlayer.play(TYPE_ZEROETV);

			//Kind of sketch, but if the sound effect is on, we know the type was determined.
			notif.dataset.type = TYPE_ZEROETV;
		}

		//Highlight for ETV
		notif.style.backgroundColor = Settings.get("notification.monitor.zeroETV.color");
		if (notif.getAttribute("data-notification-type") != TYPE_HIGHLIGHT) {
			notif.setAttribute("data-notification-type", TYPE_ZEROETV);
		}

		//Move the notification to the top
		this.#moveNotifToTop(notif);
	}

	#highlightedItemFound(asin, playSoundEffect = true) {
		const notif = this.#getNotificationByASIN(asin);

		if (!notif) {
			return false;
		}

		//Play the highlight sound effect
		if (playSoundEffect) {
			SoundPlayer.play(TYPE_HIGHLIGHT);

			//Kind of sketch, but if the sound effect is on, we know the type was determined.
			//notif.dataset.type = TYPE_HIGHLIGHT;
		}

		//Highlight for Highlighted item
		notif.dataset.type = TYPE_HIGHLIGHT;
		notif.style.backgroundColor = Settings.get("notification.monitor.highlight.color");

		//Move the notification to the top
		this.#moveNotifToTop(notif);
	}

	#regularItemFound(asin, playSoundEffect = true) {
		const notif = this.#getNotificationByASIN(asin);

		if (!notif) {
			return false;
		}

		//Play the regular notification sound effect.
		if (playSoundEffect) {
			SoundPlayer.play(TYPE_REGULAR);

			//Kind of sketch, but if the sound effect is on, we know the type was determined.
			notif.dataset.type = TYPE_REGULAR;
		}
	}

	#blurItemFound(asin) {
		const notif = this.#getNotificationByASIN(asin);

		if (!notif) {
			return false;
		}

		//Blur the thumbnail and title
		notif.querySelector(".vh-img-container>img")?.classList.add("blur");
		notif.querySelector(".vvp-item-product-title-container>a")?.classList.add("dynamic-blur");
	}

	#processNotificationFiltering(node) {
		if (!node) {
			return false;
		}

		const filterType = document.querySelector("select[name='filter-type']");
		const filterQueue = document.querySelector("select[name='filter-queue']");

		const notificationType = parseInt(node.dataset.type);
		const queueType = node.dataset.queue;

		//Feed Paused
		if (node.dataset.feedPaused == "true") {
			node.style.display = "none";
			return false;
		}

		if (filterType.value == -1) {
			node.style.display = "flex";
		} else if (filterType.value == TYPE_HIGHLIGHT_OR_ZEROETV) {
			const typesToShow = [TYPE_HIGHLIGHT, TYPE_ZEROETV];
			node.style.display = typesToShow.includes(notificationType) ? "flex" : "none";
			typesToShow.includes(notificationType);
		} else {
			node.style.display = notificationType == filterType.value ? "flex" : "none";
			notificationType == filterType.value;
		}

		if (node.style.display == "flex") {
			if (filterQueue.value == "-1") {
				return true;
			} else {
				node.style.display = queueType == filterQueue.value ? "flex" : "none";
				return queueType == filterQueue.value;
			}
		} else {
			return false;
		}
	}

	//############################################################
	//## CLICK HANDLERS

	#handleHideClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;

		document.querySelector("#vh-notification-" + asin).remove();
	}

	#handleBrendaClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const queue = e.target.dataset.queue;

		let etv = document.querySelector("#vh-notification-" + asin + " .etv").dataset.etvMax;

		window.BrendaAnnounceQueue.announce(asin, etv, queue, I13n.getDomainTLD());
	}

	#handlePinClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const isParentAsin = e.target.dataset.isParentAsin;
		const enrollmentGUID = e.target.dataset.enrollmentGuid;
		const queue = e.target.dataset.queue;
		const title = e.target.dataset.title;
		const thumbnail = e.target.dataset.thumbnail;

		PinnedList.addItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGUID);

		//Display notification
		Notifications.pushNotification(
			new ScreenNotification({
				title: `Item ${asin} pinned.`,
				lifespan: 3,
				content: title,
			})
		);
	}

	#handleDetailsClick(e) {
		e.preventDefault();

		const asin = e.target.dataset.asin;
		const date = e.target.dataset.date;
		const reason = e.target.dataset.reason;
		const highlightKW = e.target.dataset.highlightkw;
		const blurKW = e.target.dataset.blurkw;

		let m = DialogMgr.newModal("item-details-" + asin);
		m.title = "Item " + asin;
		m.content =
			"<ul>" +
			"<li>Broadcast date/time: " +
			date +
			"</li>" +
			"<li>Broadcast reason: " +
			reason +
			"</li>" +
			"<li>Highlight Keyword: " +
			highlightKW +
			"</li>" +
			"<li>Blur Keyword: " +
			blurKW +
			"</li></ul>";
		m.show();
	}

	#handleReportClick(e) {
		e.preventDefault(); // Prevent the default click behavior
		const asin = e.target.dataset.asin;

		let val = prompt(
			"Are you sure you want to REPORT the user who posted ASIN#" +
				asin +
				"?\n" +
				"Only report notifications which are not Amazon products\n" +
				"Note: False reporting may get you banned.\n\n" +
				"type REPORT in the field below to send a report:"
		);
		if (val !== null && val.toLowerCase() == "report") {
			this.#send_report(asin);
		}
	}

	#send_report(asin) {
		let manifest = chrome.runtime.getManifest();

		const content = {
			api_version: 5,
			app_version: manifest.version,
			country: I13n.getCountryCode(),
			action: "report_asin",
			uuid: Settings.get("general.uuid", false),
			asin: asin,
		};
		const options = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(content),
		};

		showRuntime("Sending report...");

		//Send the report to VH's server
		fetch(VINE_HELPER_API_V5_URL, options).then(function () {
			alert("Report sent. Thank you.");
		});
	}

	//#######################################################
	//## UTILITY METHODS

	#moveNotifToTop(notif) {
		const container = document.getElementById("vvp-items-grid");
		container.insertBefore(notif, container.firstChild);
	}

	#getNotificationByASIN(asin) {
		return document.querySelector("#vh-notification-" + asin);
	}

	#formatETV(etv) {
		let formattedETV = "";
		if (etv != null) {
			formattedETV = new Intl.NumberFormat(I13n.getLocale(), {
				style: "currency",
				currency: I13n.getCurrency(),
			}).format(etv);
		}
		return formattedETV;
	}

	#formatDate(date) {
		return new Date(date.replace(" ", "T") + "Z").toLocaleString(I13n.getLocale(), {
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
	}

	#autoTruncate(max = 2000) {
		//Auto truncate
		if (document.getElementById("auto-truncate").checked) {
			const itemsD = document.getElementsByClassName("vvp-item-tile");
			const itemsCount = itemsD.length;
			if (itemsCount > max) {
				for (let i = itemsCount - 1; i >= 2000; i--) {
					itemsD[i].remove(); //remove the element from the DOM
					console.log("Truncating " + asin);
				}
			}
		}
	}
	#updateTabTitle() {
		// Select all child elements of #vvp-items-grid
		const children = document.querySelectorAll("#vvp-items-grid > *");

		// Filter and count elements that are not display: none
		const visibleChildrenCount = Array.from(children).filter(
			(child) => window.getComputedStyle(child).display !== "none"
		).length;

		document.title = "VHNM (" + visibleChildrenCount + ")";
	}
}

export { NotificationMonitor };
