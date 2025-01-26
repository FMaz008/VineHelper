import { ISODatetoYMDHiS } from "../scripts/DateHelper.js";

import { Environment } from "../scripts/Environment.js";
var env = new Environment();

import { Internationalization } from "../scripts/Internationalization.js";
const i13n = new Internationalization();

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
})();

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
	let html = "<table id='vh-item-table' border='1'>";
	html += "<tr>";
	html += "<th>ASIN</th>";
	html += "<th>Title</th>";
	html += "<th>ETV</th>";
	html += "<th>Queue</th>";
	html += "<th>Order Success</th>";
	html += "<th>Order Failed</th>";
	html += "<th>Date created</th>";
	html += "<th>Date broadcasted</th>";
	html += "</tr>";
	html += "</table>";
	container.innerHTML = html;

	const table = document.getElementById("vh-item-table");
	for (const [key, values] of Object.entries(data["items"])) {
		html = "<tr>";
		html += "<td>" + values.asin + "</td>";
		html += "<td>" + values.title + "</td>";
		html += "<td>" + (values.etv == null ? "N/A" : values.etv) + "</td>";
		html += "<td>" + values.queue + "</td>";
		html += "<td>" + values.order_success + "</td>";
		html += "<td>" + values.order_failed + "</td>";
		html += "<td>" + ISODatetoYMDHiS(values.date_added) + "</td>";
		html += "<td>" + (values.last_broadcast == null ? "never" : ISODatetoYMDHiS(values.last_broadcast)) + "</td>";
		html += "</tr>";
		table.innerHTML += html;
	}
}

function displayError(message) {
	document.getElementById("vh-item-explorer-content").innerHTML = "<div class='notice'>" + message + "</div>";
}
