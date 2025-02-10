import { ISODatetoYMDHiS } from "../scripts/DateHelper.js";

import { Environment } from "../scripts/Environment.js";
var env = new Environment();

import { Internationalization } from "../scripts/Internationalization.js";
const i13n = new Internationalization();

import { Pagination } from "../scripts/Pagination.js";
const pagination = new Pagination();

import { PinnedListMgr } from "../scripts/PinnedListMgr.js";
var PinnedList = new PinnedListMgr();

import { SettingsMgr } from "../scripts/SettingsMgr.js";
const Settings = new SettingsMgr();

(async () => {
	await Settings.waitForLoad();

	//Check if the membership is valid
	if (Settings.isPremiumUser(3) == false) {
		displayError("You need to be a tier 3 Patreon subscriber to use this feature.");
		return;
	}

	const countryCode = Settings.get("general.country");

	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
	}

	let lastSearchTime = 0;
	const searchBtn = document.getElementById("search-button");

	searchBtn.addEventListener("click", function () {
		if (searchBtn.disabled) {
			return;
		}

		const now = Date.now();
		if (now - lastSearchTime < 10000) {
			return;
		}
		lastSearchTime = now;

		queryDB();
		searchBtn.disabled = true;
	});

	document.getElementById("search-asin").addEventListener("keyup", function (event) {
		//If ENTER is pressed, search
		if (event.key === "Enter") {
			searchBtn.click();
		}
	});
	document.getElementById("search-title").addEventListener("keyup", function (event) {
		if (event.key === "Enter") {
			searchBtn.click();
		}
	});

	loadFormItemsStateFromURL();
})();

function disableSearch() {
	const searchBtn = document.getElementById("search-button");
	let secondsLeft = 10;
	searchBtn.disabled = true;
	searchBtn.value = `Wait ${secondsLeft}s`;

	let countdownInterval = setInterval(() => {
		secondsLeft--;
		if (secondsLeft <= 0) {
			clearInterval(countdownInterval);
			enableSearch();
		} else {
			searchBtn.value = `Wait ${secondsLeft}s`;
		}
	}, 1000);

	const paginationContainerTop = document.getElementById("vh-pagination-top");
	const paginationContainerBottom = document.getElementById("vh-pagination-bottom");
	const links = document.querySelectorAll("ul.a-pagination li a");
	links.forEach((link) => {
		link.addEventListener("click", preventDefault);
		link.style.pointerEvents = "none";
	});
	paginationContainerTop.style.opacity = "0.5";
	paginationContainerBottom.style.opacity = "0.5";
}

function enableSearch() {
	const searchBtn = document.getElementById("search-button");
	searchBtn.disabled = false;
	searchBtn.value = "Search";
	const paginationContainerTop = document.getElementById("vh-pagination-top");
	const paginationContainerBottom = document.getElementById("vh-pagination-bottom");
	paginationContainerTop.style.opacity = "unset";
	paginationContainerBottom.style.opacity = "unset";

	const links = document.querySelectorAll("ul.a-pagination li a");
	links.forEach((link) => {
		link.removeEventListener("click", preventDefault);
		link.style.pointerEvents = "auto";
	});
}
function preventDefault(event) {
	alert("preventDefault");
	event.preventDefault();
	return false;
}

function generateUrl() {
	const asin = document.getElementById("search-asin").value;
	const title = document.getElementById("search-title").value;
	const orderBy = document.getElementById("vh-order-by-select").value;
	const orderBy2 = document.getElementById("vh-order-by-select2").value;
	const etvMin = document.getElementById("search-etv-min").value;
	const etvMax = document.getElementById("search-etv-max").value;
	const queue = document.getElementById("vh-queue-select").value;
	const excludeUnavailable = document.getElementById("search-exclude-unavailable").checked;
	return (
		"/page/item_explorer.html?asin=" +
		encodeURI(asin) +
		"&title=" +
		encodeURI(title) +
		"&orderBy=" +
		encodeURI(orderBy) +
		"&orderBy2=" +
		encodeURI(orderBy2) +
		"&etvMin=" +
		encodeURI(etvMin) +
		"&etvMax=" +
		encodeURI(etvMax) +
		"&queue=" +
		encodeURI(queue) +
		"&excludeUnavailable=" +
		encodeURI(excludeUnavailable)
	);
}

function loadFormItemsStateFromURL() {
	const asin = document.getElementById("search-asin");
	const title = document.getElementById("search-title");
	const orderBy = document.getElementById("vh-order-by-select");
	const orderBy2 = document.getElementById("vh-order-by-select2");
	const etvMin = document.getElementById("search-etv-min");
	const etvMax = document.getElementById("search-etv-max");
	const queue = document.getElementById("vh-queue-select");
	const excludeUnavailable = document.getElementById("search-exclude-unavailable");
	//If the URL contains the parameters, load them
	if (window.location.search) {
		const urlParams = new URLSearchParams(window.location.search);
		asin.value = urlParams.get("asin");
		title.value = urlParams.get("title");
		orderBy.value = urlParams.get("orderBy");
		orderBy2.value = urlParams.get("orderBy2");
		etvMin.value = urlParams.get("etvMin");
		etvMax.value = urlParams.get("etvMax");
		queue.value = urlParams.get("queue");
		excludeUnavailable.checked = urlParams.get("excludeUnavailable") == "true";
		queryDB(parseInt(urlParams.get("page")));
	}
}

function queryDB(page = 1) {
	const asin = document.getElementById("search-asin").value;
	const title = document.getElementById("search-title").value;
	const orderBy = document.getElementById("vh-order-by-select").value;
	const orderBy2 = document.getElementById("vh-order-by-select2").value;
	const queue = document.getElementById("vh-queue-select").value;
	const etvMin = document.getElementById("search-etv-min").value;
	const etvMax = document.getElementById("search-etv-max").value;
	const excludeUnavailable = document.getElementById("search-exclude-unavailable").checked;

	const content = {
		api_version: 5,
		app_version: env.data.appVersion,
		action: "item_explorer",
		country: i13n.getCountryCode(),
		uuid: Settings.get("general.uuid", false),
		asin: asin,
		title: title,
		orderBy: orderBy,
		orderBy2: orderBy2,
		queue: queue,
		page: page,
		etvMin: etvMin,
		etvMax: etvMax,
		excludeUnavailable: excludeUnavailable,
	};

	fetch(env.getAPIUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(content),
	})
		.then(async (response) => {
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Server error");
			}
			return data;
		})
		.then(serverProductsResponse)
		.catch(function (error) {
			displayError("Error fetching data from server: " + error.message);
		});
}

function serverProductsResponse(data) {
	if (data["invalid_uuid"] == true) {
		displayError("Invalid UUID or Patreon subscription insufficient.");
		//Do no complete this execution
		return false;
	}
	const container = document.getElementById("vh-item-explorer-content");

	//Create the HTML for the basic table containing the products
	let html = "<table id='vh-item-table'>";
	html += "<tr>";
	html += "<th rowspan='2'>ASIN</th>";
	html += "<th rowspan='2'>Title</th>";
	html += "<th rowspan='2'>ETV</th>";
	html += "<th rowspan='2'>Queue</th>";
	html += "<th rowspan='2'><div class='vh-icon-32 vh-icon-declined'></div></th>";
	html += "<th colspan='2'>Orders</th>";
	html += "<th rowspan='2'>Date created</th>";
	html += "<th rowspan='2'>Last broadcast</th>";
	html += "</tr>";
	html += "<tr>";
	html += `<th style="padding:2px"><div class="vh-icon-32 vh-icon-order-success"></div></th>`;
	html += `<th style="padding:2px"><div class="vh-icon-32 vh-icon-order-failed"></div></th>`;
	html += "</tr>";
	html += "</table>";
	container.innerHTML = html;

	const table = document.getElementById("vh-item-table");
	const paginationContainerTop = document.getElementById("vh-pagination-top");
	const paginationContainerBottom = document.getElementById("vh-pagination-bottom");

	if (data["items"] == null || data["items"].length == 0) {
		table.innerHTML += "<tr><td colspan='9' style='text-align: center;'>No items found</td></tr>";
		paginationContainerTop.innerHTML = "";
		paginationContainerBottom.innerHTML = "";
		disableSearch();
		return;
	}

	for (const [key, values] of Object.entries(data["items"])) {
		let searchStyle = "";
		let searchUrl;
		if (
			Settings.get("general.searchOpenModal") &&
			values.is_parent_asin != null &&
			values.enrollment_guid != null &&
			values.queue != "potluck"
		) {
			searchUrl = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${values.asin};${values.queue};${values.is_parent_asin ? "true" : "false"};${values.enrollment_guid}`;
		} else {
			if (values.queue == "potluck") {
				searchStyle = "opacity: 0.4;";
			}
			const truncatedTitle =
				values.title.length > 40 ? values.title.substr(0, 40).split(" ").slice(0, -1).join(" ") : values.title;
			const search_url_slug = encodeURIComponent(truncatedTitle);
			searchUrl = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search_url_slug}`;
		}

		html = "<tr>";
		html += "<td class='asin'>";
		html += `<div class='thumbnailContainer'><img src='${values.img_url}'><div class='iconsContainer'>`;
		html += `<a href='${searchUrl}' target='_blank'><div class='vh-icon-16 vh-icon-search' style='margin-left: 5px;${searchStyle}'></div></a>`;
		if (Settings.get("pinnedTab.active") && values.queue != "potluck") {
			html += `<div class='vh-icon-16 vh-icon-pin'
							data-asin='${values.asin}'
							data-queue='${values.queue}'
							data-is-parent-asin='${values.is_parent_asin}'
							data-enrollment-guid='${values.enrollment_guid}'
							data-title='${values.title}'
							data-thumbnail='${values.img_url}' 
							style='margin-left: 5px;'></div>`;
		}
		html += `</div></div>`;
		html += values.asin;
		html += `<a href='https://www.amazon.${i13n.getDomainTLD()}/dp/${values.asin}' target='_blank'><div class='vh-icon-16 vh-icon-newtab' style='margin-left: 5px;'></div></a>`;
		if (values.is_parent_asin) {
			html += `<br /><span style='font-size: 8pt;'>(<a href='#' class='load-variants' data-asin='${values.asin}'>load variants</a>)</span>`;
		}
		html += "</td>";
		html += "<td>";
		html += values.title;
		html += `</td>`;
		html += "<td style='text-align: right;'>" + (values.etv == null ? "N/A" : values.etv) + "</td>";
		html += "<td>" + values.queue + "</td>";
		html +=
			"<td style='text-align: center;'>" +
			(values.unavailable ? "<div class='vh-icon-16 vh-icon-declined'></div>" : "") +
			"</td>";
		html += "<td style='text-align: center;'>" + values.order_success + "</td>";
		html += "<td style='text-align: center;'>" + values.order_failed + "</td>";
		html += "<td>" + ISODatetoYMDHiS(values.date_added) + "</td>";
		html += "<td>" + (values.last_broadcast == null ? "never" : ISODatetoYMDHiS(values.last_broadcast)) + "</td>";
		html += "</tr>";
		table.innerHTML += html;
	}

	paginationContainerTop.innerHTML = "";
	paginationContainerBottom.innerHTML = "";
	paginationContainerTop.appendChild(
		pagination.generatePagination(generateUrl(), data["total_items"], 50, data["page"], true)
	);
	paginationContainerBottom.appendChild(
		pagination.generatePagination(generateUrl(), data["total_items"], 50, data["page"], true)
	);

	//Add pinned item listerner
	if (Settings.get("pinnedTab.active")) {
		const pinnedItems = document.querySelectorAll(".vh-icon-pin");
		pinnedItems.forEach((item) => {
			item.addEventListener("click", () => {
				const asin = item.getAttribute("data-asin");
				const queue = item.getAttribute("data-queue");
				const isParentAsin = item.getAttribute("data-is-parent-asin");
				const enrollmentGuid = item.getAttribute("data-enrollment-guid");
				const title = item.getAttribute("data-title");
				const thumbnail = item.getAttribute("data-thumbnail");

				PinnedList.addItem(asin, queue, title, thumbnail, isParentAsin, enrollmentGuid);

				item.style.opacity = "0.4";
			});
		});
	}

	//Add event listener to the load variants link
	const loadVariants = document.querySelectorAll(".load-variants");
	loadVariants.forEach((item) => {
		item.addEventListener("click", (event) => {
			event.preventDefault();
			const tr = item.parentElement.parentElement.parentElement;
			const asin = item.getAttribute("data-asin");

			//Delete the link
			item.parentElement.remove();

			//Query the API for the variants
			const content = {
				api_version: 5,
				version: env.data.appVersion,
				action: "item_explorer_variants",
				country: i13n.getCountryCode(),
				uuid: Settings.get("general.uuid", false),
				asin: asin,
			};
			fetch(env.getAPIUrl(), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(content),
			})
				.then(async (response) => {
					const data = await response.json();
					if (!response.ok) {
						throw new Error(data.error || "Server error");
					}
					return data;
				})
				.then((data) => {
					//Delete all pre-existing variant rows for that asin
					const variantRows = document.querySelectorAll(`.variant-row-${asin}`);
					variantRows.forEach((row) => {
						row.remove();
					});

					//Create the new rows.
					for (const variant of data.variants) {
						const html = `<tr class='variant-row-${asin}' style='font-size: 8pt;'>
						<td>
							${variant.asin}
							<a href='https://www.amazon.${i13n.getDomainTLD()}/dp/${variant.asin}' target='_blank'><div class='vh-icon-12 vh-icon-newtab' style='margin-left: 5px;'></div></a>	
						</td>
						<td>${variant.title}</td>
						<td style='text-align: right;'>${variant.etv}</td>
						<td colspan='6'></td>
					</tr>`;

						//Insert the HTML after the tr
						tr.insertAdjacentHTML("afterend", html);
					}
				});
		});
	});

	disableSearch();
}

function displayError(message) {
	document.getElementById("vh-item-explorer-content").innerHTML = "<div class='notice'>" + message + "</div>";
}
