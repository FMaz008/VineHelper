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
				const startPixel = startIdx === 0 ? chartArea.left : scale.getPixelForValue(startIdx);
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
			generateGraph(canvas, data.drop_stats);

			const canvas5 = document.createElement("canvas");
			document.getElementById("vh-drop-stats-stacked").appendChild(canvas5);
			generateStackedGraph(canvas5, data.drop_stats_rfy, data.drop_stats_afa, data.drop_stats_ai);

			const canvas2 = document.createElement("canvas");
			document.getElementById("vh-drop-stats-rfy").appendChild(canvas2);
			generateGraph(canvas2, data.drop_stats_rfy);

			const canvas3 = document.createElement("canvas");
			document.getElementById("vh-drop-stats-afa").appendChild(canvas3);
			generateGraph(canvas3, data.drop_stats_afa);

			const canvas4 = document.createElement("canvas");
			document.getElementById("vh-drop-stats-ai").appendChild(canvas4);
			generateGraph(canvas4, data.drop_stats_ai);
		});
})();

function generateGraph(canvas, data) {
	if (!data) {
		console.error("No data for graph");
		return;
	}
	// When creating the chart, store the original dates
	const dates = data.map((d) => new Date(d.hour_slot));
	const chart = new Chart(canvas, {
		type: "bar",
		data: {
			labels: data.map((d) => {
				const date = new Date(d.hour_slot);
				return date.toLocaleString("en-US", { weekday: "long" }) + " " + date.getHours() + ":00";
			}),
			_source_dates: dates, // Store the original dates here
			datasets: [
				{
					label: "Items per Hour",
					data: data.map((d) => d.item_count),
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
							const date = new Date(data[index].hour_slot);
							return date.toLocaleString("en-US", { weekday: "short" }) + " " + date.getHours() + ":00";
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
}

function generateStackedGraph(canvas, dataRFY, dataAFA, dataAI) {
	if (!dataRFY || !dataAFA || !dataAI) {
		console.error("No data for graph");
		return;
	}
	// When creating the chart, store the original dates
	const dates = dataRFY.map((d) => new Date(d.hour_slot));
	const chart = new Chart(canvas, {
		type: "bar",
		data: {
			labels: dataRFY.map((d) => {
				const date = new Date(d.hour_slot);
				return date.toLocaleString("en-US", { weekday: "long" }) + " " + date.getHours() + ":00";
			}),
			_source_dates: dates, // Store the original dates here
			datasets: [
				{
					label: "AI Items",
					data: dataAI.map((d) => d.item_count),
					backgroundColor: "rgba(75, 192, 192, 0.8)",
					borderColor: "rgb(75, 192, 192)",
					borderWidth: 1,
				},
				{
					label: "AFA Items",
					data: dataAFA.map((d) => d.item_count),
					backgroundColor: "rgba(54, 162, 235, 0.8)",
					borderColor: "rgb(54, 162, 235)",
					borderWidth: 1,
				},
				{
					label: "RFY Items",
					data: dataRFY.map((d) => d.item_count),
					backgroundColor: "rgba(255, 99, 132, 0.8)",
					borderColor: "rgb(255, 99, 132)",
					borderWidth: 1,
				},
			],
		},
		options: {
			responsive: true,
			scales: {
				y: {
					beginAtZero: true,
					stacked: true,
				},
				x: {
					grid: {
						display: false,
					},
					stacked: true,
					ticks: {
						callback: function (value, index) {
							const date = new Date(dataRFY[index].hour_slot);
							return date.toLocaleString("en-US", { weekday: "short" }) + " " + date.getHours() + ":00";
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
}

function displayError(message) {
	document.getElementById("vh-item-explorer-content").innerHTML = "<div class='notice'>" + message + "</div>";
}
