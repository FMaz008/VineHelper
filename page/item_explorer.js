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
	console.log(countryCode);
	if (countryCode != null) {
		i13n.setCountryCode(countryCode);
	}

	let lastSearchTime = 0;
	const searchBtn = document.getElementById("search-button");
	let countdownInterval;

	searchBtn.addEventListener("click", function () {
		if (searchBtn.disabled) {
			return;
		}

		const now = Date.now();
		if (now - lastSearchTime < 10000) {
			return;
		}
		lastSearchTime = now;
		searchBtn.disabled = true;
		queryDB();

		let secondsLeft = 10;
		searchBtn.value = `Wait ${secondsLeft}s`;

		countdownInterval = setInterval(() => {
			secondsLeft--;
			if (secondsLeft <= 0) {
				clearInterval(countdownInterval);
				searchBtn.disabled = false;
				searchBtn.value = "Search";
			} else {
				searchBtn.value = `Wait ${secondsLeft}s`;
			}
		}, 1000);
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

function generateUrl() {
	const asin = document.getElementById("search-asin").value;
	const title = document.getElementById("search-title").value;
	const orderBy = document.getElementById("vh-order-by-select").value;
	const queue = document.getElementById("vh-queue-select").value;

	return (
		"/page/item_explorer.html?asin=" +
		encodeURI(asin) +
		"&title=" +
		encodeURI(title) +
		"&orderBy=" +
		encodeURI(orderBy) +
		"&queue=" +
		encodeURI(queue)
	);
}

function loadFormItemsStateFromURL() {
	const asin = document.getElementById("search-asin");
	const title = document.getElementById("search-title");
	const orderBy = document.getElementById("vh-order-by-select");
	const queue = document.getElementById("vh-queue-select");

	//If the URL contains the parameters, load them
	if (window.location.search) {
		const urlParams = new URLSearchParams(window.location.search);
		asin.value = urlParams.get("asin");
		title.value = urlParams.get("title");
		orderBy.value = urlParams.get("orderBy");
		queue.value = urlParams.get("queue");
		queryDB(parseInt(urlParams.get("page")));
	}
}

function queryDB(page = 1) {
	const asin = document.getElementById("search-asin").value;
	const title = document.getElementById("search-title").value;
	const orderBy = document.getElementById("vh-order-by-select").value;
	const queue = document.getElementById("vh-queue-select").value;

	console.log(i13n.getCountryCode());
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
	if (data["items"] == null || data["items"].length == 0) {
		table.innerHTML += "<tr><td colspan='8' style='text-align: center;'>No items found</td></tr>";
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
		html += `<img src='${values.img_url}' style='display:block;margin:0 auto;width: 60px; height: 60px;'>`;
		html += values.asin;
		html += `<a href='https://www.amazon.${i13n.getDomainTLD()}/dp/${values.asin}' target='_blank'><div class='vh-icon-16 vh-icon-newtab' style='margin-left: 5px;'></div></a>`;
		html += "</td>";
		html += "<td>";
		html += values.title;
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
		html += `</td>`;
		html += "<td>" + (values.etv == null ? "N/A" : values.etv) + "</td>";
		html += "<td>" + values.queue + "</td>";
		html +=
			"<td style='text-align: center;'>" +
			(values.unavailable ? "<div class='vh-icon-16 vh-icon-declined'></div>" : "") +
			"</td>";
		html += "<td>" + values.order_success + "</td>";
		html += "<td>" + values.order_failed + "</td>";
		html += "<td>" + ISODatetoYMDHiS(values.date_added) + "</td>";
		html += "<td>" + (values.last_broadcast == null ? "never" : ISODatetoYMDHiS(values.last_broadcast)) + "</td>";
		html += "</tr>";
		table.innerHTML += html;
	}

	const paginationContainerTop = document.getElementById("vh-pagination-top");
	const paginationContainerBottom = document.getElementById("vh-pagination-bottom");
	paginationContainerTop.innerHTML = "";
	paginationContainerBottom.innerHTML = "";
	paginationContainerTop.appendChild(
		pagination.generatePagination(generateUrl(), data["total_items"], 50, data["page"])
	);
	paginationContainerBottom.appendChild(
		pagination.generatePagination(generateUrl(), data["total_items"], 50, data["page"])
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
}

function displayError(message) {
	document.getElementById("vh-item-explorer-content").innerHTML = "<div class='notice'>" + message + "</div>";
}
