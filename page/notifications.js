window.onload = function () {
	document
		.getElementById("ext-helper-notifications-container")
		.append("Hello");

	chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
		console.log(data);

		if (data.type == undefined) return;

		if (data.type == "newItem") {
			/*
			type: "newItem",
			date: response.products[i].date,
			asin: response.products[i].asin,
			title: response.products[i].title,
			img_url: response.products[i].img_url,
			*/
			title = data.title.replace(/^(.{40}[^\s]*).*/, "$1");

			content =
				"<img src='" +
				data.img_url +
				"' style='float:left;' width='50' height='50' />";

			content +=
				" <a href='/vine/vine-items?search=" +
				title +
				"' target='_blank'><div class='ext-helper-toolbar-large-icon ext-helper-icon-search' style='float:right'></div></a>";

			content +=
				"<a href='/dp/" +
				data.asin +
				"' target='_blank'>" +
				data.title +
				"</a>";

			content += "<hr />";

			document
				.getElementById("ext-helper-notifications-container")
				.append(content);
		}
	});
};
