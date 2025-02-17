import { Environment } from "../scripts/Environment.js";
var env = new Environment();

import { Internationalization } from "../scripts/Internationalization.js";
const i13n = new Internationalization();

import { SettingsMgr } from "../scripts/SettingsMgr.js";
const Settings = new SettingsMgr();

import { Chart, registerables } from "../scripts/chart.js/dist/chart.js";
// Register required components
Chart.register(...registerables);

// Register custom background plugin
Chart.register({
	id: "customBackground",
	beforeDraw: (chart) => {
		const { ctx, chartArea } = chart;
		if (!chartArea) return;

		// Use the original dates from drop_stats instead of labels
		const dates = chart.data._source_dates;
		if (!dates) return; // Safety check

		const scale = chart.scales.x;

		// Find the first and last date
		const firstDate = dates[0];
		const lastDate = dates[dates.length - 1];

		// Calculate days between
		const days = Math.ceil((lastDate - firstDate) / (24 * 60 * 60 * 1000));

		// For each day
		for (let i = 0; i <= days; i++) {
			const currentDay = new Date(firstDate);
			currentDay.setDate(currentDay.getDate() + i);
			// Set to start of day (0h)
			currentDay.setHours(0, 0, 0, 0);

			const nextDay = new Date(currentDay);
			nextDay.setDate(nextDay.getDate() + 1);

			// Find start and end indices for this day
			const startIdx = dates.findIndex((d) => d >= currentDay);
			const endIdx = dates.findIndex((d) => d >= nextDay);

			if (startIdx !== -1) {
				const startPixel = scale.getPixelForValue(startIdx);
				const endPixel = endIdx !== -1 ? scale.getPixelForValue(endIdx) : chartArea.right;

				ctx.fillStyle = i % 2 === 0 ? "rgba(0,0,0,0.05)" : "rgba(0,0,0,0.15)";
				ctx.fillRect(startPixel, chartArea.top, endPixel - startPixel, chartArea.bottom - chartArea.top);
			}
		}
	},
});

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

	//Fetch drop stats
	const data = {
		api_version: 5,
		app_version: env.data.appVersion,
		action: "item_explorer_stats",
		country: i13n.getCountryCode(),
		uuid: Settings.get("general.uuid", false),
	};

	fetch(env.getAPIUrl(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	})
		.then(async (response) => {
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || "Server error");
			}
			return data;
		})
		.then(async (data) => {
			//Data format:
			//drop_stats: [
			//	{
			//		hour_slot: "2024-01-01T00:00:00.000Z",
			//		item_count: 100,
			//	},
			// ...
			//]

			//Create a chart
			// Create canvas element for the chart
			const canvas = document.createElement("canvas");
			document.getElementById("vh-drop-stats").appendChild(canvas);

			// When creating the chart, store the original dates
			const dates = data.drop_stats.map((d) => new Date(d.hour_slot));
			const chart = new Chart(canvas, {
				type: "bar",
				data: {
					labels: data.drop_stats.map((d) => {
						const date = new Date(d.hour_slot);
						return date.toLocaleString("en-US", { weekday: "long" }) + " " + date.getHours() + "h";
					}),
					_source_dates: dates, // Store the original dates here
					datasets: [
						{
							label: "Items per Hour",
							data: data.drop_stats.map((d) => d.item_count),
							tension: 0.1,
						},
					],
				},
				options: {
					responsive: true,
					scales: {
						y: {
							beginAtZero: true,
						},
						x: {
							grid: {
								display: false,
							},
							ticks: {
								callback: function (value, index) {
									const date = new Date(data.drop_stats[index].hour_slot);
									return (
										date.toLocaleString("en-US", { weekday: "long" }) + " " + date.getHours() + "h"
									);
								},
							},
						},
					},
					plugins: {
						legend: {
							display: true,
						},
						customBackground: true, // Enable the custom background plugin
					},
				},
			});
		});
})();

function displayError(message) {
	document.getElementById("vh-item-explorer-content").innerHTML = "<div class='notice'>" + message + "</div>";
}
