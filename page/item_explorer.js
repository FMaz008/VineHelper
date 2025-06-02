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

import { unescapeHTML, removeSpecialHTML } from "../scripts/StringHelper.js";

let secondsLeft = 10;

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

	const searchBtn = document.getElementById("search-button");

	searchBtn.addEventListener("click", function () {
		if (searchBtn.disabled) {
			return;
		}

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
	const etvMin = document.getElementById("search-etv-min").value;
	const etvMax = document.getElementById("search-etv-max").value;
	const queue = document.getElementById("vh-queue-select").value;
	const unavailable = document.getElementById("unavailable-select").value;
	return (
		"/page/item_explorer.html?asin=" +
		encodeURI(asin) +
		"&title=" +
		encodeURI(title) +
		"&orderBy=" +
		encodeURI(orderBy) +
		"&etvMin=" +
		encodeURI(etvMin) +
		"&etvMax=" +
		encodeURI(etvMax) +
		"&queue=" +
		encodeURI(queue) +
		"&unavailable=" +
		encodeURI(unavailable)
	);
}

function loadFormItemsStateFromURL() {
	const asin = document.getElementById("search-asin");
	const title = document.getElementById("search-title");
	const orderBy = document.getElementById("vh-order-by-select");
	const etvMin = document.getElementById("search-etv-min");
	const etvMax = document.getElementById("search-etv-max");
	const queue = document.getElementById("vh-queue-select");
	const unavailable = document.getElementById("unavailable-select");
	//If the URL contains the parameters, load them
	if (window.location.search) {
		const urlParams = new URLSearchParams(window.location.search);
		asin.value = urlParams.get("asin");
		title.value = urlParams.get("title");
		orderBy.value = urlParams.get("orderBy");
		etvMin.value = urlParams.get("etvMin");
		etvMax.value = urlParams.get("etvMax");
		queue.value = urlParams.get("queue");
		unavailable.value = urlParams.get("unavailable");
		queryDB(parseInt(urlParams.get("page")));
	}
}

function queryDB(page = 1) {
	const asin = document.getElementById("search-asin").value;
	const title = document.getElementById("search-title").value;
	const orderBy = document.getElementById("vh-order-by-select").value;
	const queue = document.getElementById("vh-queue-select").value;
	const etvMin = document.getElementById("search-etv-min").value;
	const etvMax = document.getElementById("search-etv-max").value;
	const unavailable = document.getElementById("unavailable-select").value;

	const content = {
		api_version: 5,
		app_version: env.data.appVersion,
		action: "item_explorer",
		country: i13n.getCountryCode(),
		uuid: Settings.get("general.uuid", false),
		asin: asin,
		title: title,
		orderBy: orderBy,
		queue: queue,
		page: page,
		etvMin: etvMin,
		etvMax: etvMax,
		unavailable: unavailable,
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
function openSeeDetails(asin, queue, isParentAsin, enrollmentGuid, variantAsin = null) {
	if (variantAsin !== null) {
		window.open(
			`https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${isParentAsin};${enrollmentGuid};${variantAsin}`,
			"_blank"
		);
	} else {
		window.open(
			`https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?queue=encore#openModal;${asin};${queue};${isParentAsin};${enrollmentGuid}`,
			"_blank"
		);
	}
}
function serverProductsResponse(data) {
	if (data["invalid_uuid"] == true) {
		displayError("Invalid UUID or Patreon subscription insufficient.");
		//Do no complete this execution
		return false;
	}
	const container = document.getElementById("vh-item-explorer-content");
	container.innerHTML = "";

	const stats = document.createElement("div");
	stats.id = "vh-item-explorer-stats";
	stats.style.fontSize = "8pt;";
	stats.innerText = `Query time: ${data.query_time}ms - Result(s): ${data.total_items}`;
	container.appendChild(stats);

	secondsLeft = parseInt(data.wait_time);

	//Create the HTML for the basic table containing the products
	let html = "<table id='vh-item-table'>";
	html += "<tr>";
	html += "<th rowspan='2'>ASIN</th>";
	html += "<th rowspan='2'>Title</th>";
	html += "<th rowspan='2'>ETV</th>";
	html += "<th rowspan='2'>Queue</th>";
	html +=
		"<th rowspan='2'><a href='#' title='Unavailable' style='cursor: default;'><div class='vh-icon-32 vh-icon-declined'></div></a></th>";
	html += "<th colspan='2'>Orders</th>";
	html += "<th rowspan='2'>Date created</th>";
	html += "<th rowspan='2'>Last broadcast</th>";
	html += "</tr>";
	html += "<tr>";
	html += `<th style="padding:2px"><div class="vh-icon-32 vh-icon-order-success"></div></th>`;
	html += `<th style="padding:2px"><div class="vh-icon-32 vh-icon-order-failed"></div></th>`;
	html += "</tr>";
	html += "</table>";
	container.innerHTML += html;

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
		values.title = unescapeHTML(unescapeHTML(values.title));
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
			let truncatedTitle =
				values.title.length > 40 ? values.title.substr(0, 40).split(" ").slice(0, -1).join(" ") : values.title;
			truncatedTitle = removeSpecialHTML(truncatedTitle);
			//Remove single letter words
			truncatedTitle = truncatedTitle
				.split(" ")
				.filter((word) => word.length > 1)
				.join(" ");
			const search_url_slug = encodeURIComponent(truncatedTitle);
			searchUrl = `https://www.amazon.${i13n.getDomainTLD()}/vine/vine-items?search=${search_url_slug}`;
		}

		html = `<tr data-asin='${values.asin}' data-queue='${values.queue}' data-is-parent-asin='${values.is_parent_asin}' data-enrollment-guid='${values.enrollment_guid}' data-title='${values.title}' data-thumbnail='${values.img_url}'>`;
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
		if (values.queue !== "potluck") {
			html += `<br /><span>(<a href='#' class='open-see-details' data-asin='${values.asin}' data-queue='${values.queue}' data-is-parent-asin='${values.is_parent_asin}' data-enrollment-guid='${values.enrollment_guid}'>see details</a>)</span>`;
		}
		html += `</td>`;
		html += "<td style='text-align: right;'>" + (values.etv == null ? "N/A" : values.etv) + "</td>";
		html += "<td>" + queueToAbbr(values.queue) + "</td>";
		html +=
			"<td style='text-align: center;'>" +
			(values.unavailable
				? "<a href='#' title='Unavailable' style='cursor: default;'><div class='vh-icon-16 vh-icon-declined'></div></a>"
				: "") +
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

	//Add event listener to the see details link
	const seeDetails = document.querySelectorAll(".open-see-details");
	seeDetails.forEach((item) => {
		item.addEventListener("click", (event) => {
			event.preventDefault();
			openSeeDetails(
				item.getAttribute("data-asin"),
				item.getAttribute("data-queue"),
				item.getAttribute("data-is-parent-asin"),
				item.getAttribute("data-enrollment-guid")
			);
		});
	});

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

					//Sort the variants by title
					data.variants.sort((a, b) => a.title.localeCompare(b.title));

					if (data.variants.length === 0) {
						tr.insertAdjacentHTML(
							"afterend",
							`<tr><td colspan='9' style='text-align: center;'>Variant(s) not discovered yet.</td></tr>`
						);
					} else {
						//Create the new rows.
						for (const variant of data.variants) {
							let html = `<tr class='variant-row-${asin}' style='font-size: 8pt;'>
						<td>
							${variant.asin}
							<a href='https://www.amazon.${i13n.getDomainTLD()}/dp/${variant.asin}' target='_blank'><div class='vh-icon-12 vh-icon-newtab' style='margin-left: 5px;'></div></a>	
						</td>
						<td>
							${variant.title}`;
							if (tr.getAttribute("data-queue") !== "potluck") {
								html += ` <span>(<a href='#' class='open-variant-see-details' data-asin='${tr.getAttribute("data-asin")}' data-variant-asin='${variant.asin}' data-queue='${tr.getAttribute("data-queue")}' data-is-parent-asin='false' data-enrollment-guid='${tr.getAttribute("data-enrollment-guid")}'>see details</a>)</span>`;
							}
							html += `</td>
						<td style='text-align: right;'>${variant.etv}</td>
						<td colspan='6'></td>
					</tr>`;

							//Insert the HTML after the tr
							tr.insertAdjacentHTML("afterend", html);
						}

						//Clear all existing event listeners
						const seeDetailsVariants = document.querySelectorAll(".open-variant-see-details");
						seeDetailsVariants.forEach((item) => {
							item.removeEventListener("click", (event) => {
								event.preventDefault();
							});
						});

						//Add event listener to the see details link
						seeDetailsVariants.forEach((item) => {
							item.addEventListener("click", (event) => {
								event.preventDefault();
								openSeeDetails(
									item.getAttribute("data-asin"),
									item.getAttribute("data-queue"),
									item.getAttribute("data-is-parent-asin"),
									item.getAttribute("data-enrollment-guid"),
									item.getAttribute("data-variant-asin")
								);
							});
						});
					}
				});
		});
	});

	disableSearch();
}

function displayError(message) {
	document.getElementById("vh-item-explorer-content").innerHTML = "<div class='notice'>" + message + "</div>";
}

function queueToAbbr(queue) {
	const arr = {
		potluck: "RFY",
		encore: "AI",
		last_chance: "AFA",
	};

	return arr[queue];
}
