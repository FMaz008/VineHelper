var currentTab = "vvp-items-grid";

class Grid {
	pGrid = null;
	pArrTile = [];

	constructor(obj) {
		this.pGrid = obj;
	}

	getId() {
		return $(this.pGrid).attr("id");
	}

	getDOM() {
		return this.pGrid;
	}

	addTile(t) {
		this.pArrTile.push(t);

		if (Object.keys(t).length !== 0) {
			$(t.getDOM())
				.detach()
				.appendTo("#" + this.getId());
			$(t.getDOM()).show();
		}
	}

	removeTile(t) {
		$.each(
			this.pArrTile,
			function (key, value) {
				if (value != undefined && value.getAsin() == t.getAsin()) {
					this.pArrTile.splice(key, 1);
				}
			}.bind(this)
		);
	}

	async removeTileAnimate(t) {
		this.removeTile(t);

		await t.animateVanish(); //Will hide the tile
	}

	getTileCount(trueCount = false) {
		if (trueCount) return $(this.pGrid).children().length;
		else return this.pArrTile.length;
	}

	getTileId(asin) {
		var r = null;
		$.each(this.pArrTile, function (key, value) {
			if (value != undefined && value.getAsin() == asin) {
				r = value;
				return false; //Stop the loop
			}
		});
		return r;
	}
}

function updateTileCounts() {
	//Calculate how many tiles within each grids
	if (appSettings.unavailableTab.active || appSettings.hiddenTab.active)
		$("#vh-available-count").text(gridRegular.getTileCount(true));

	if (
		appSettings.unavailableTab.active ||
		appSettings.unavailableTab.votingToolbar
	)
		$("#vh-unavailable-count").text(gridUnavailable.getTileCount(true));

	if (appSettings.hiddenTab.active)
		$("#vh-hidden-count").text(gridHidden.getTileCount(true));
}

async function createGridInterface() {
	//Clean up interface (in case of the extension being reloaded)
	$("ul#vh-tabs").remove();
	$("div#tab-unavailable").remove();
	$("div#tab-hidden").remove();
	$(".vh-status").remove(); //remove all toolbars

	if (document.getElementById("vvp-items-grid") == undefined) {
		console.log("No listing on this page, not drawing tabs.");
		return false; // No listing on this page
	}

	//Implement the tab system.
	let tabs = $("<div>").attr("id", "vh-tabs").insertBefore("#vvp-items-grid");
	$("#vvp-items-grid").detach().appendTo(tabs);
	$("#vvp-items-grid").addClass("tab-grid");

	let tplTabs = await Tpl.loadFile("view/tabs.html");

	Tpl.setIf("not_mobile", true);
	if (
		appSettings.thorvarium.mobileandroid ||
		appSettings.thorvarium.mobileios
	) {
		Tpl.setVar("available", "A");
		Tpl.setVar("unavailable", "U");
		Tpl.setVar("hidden", "H");
	} else {
		Tpl.setVar("available", "Available");
		Tpl.setVar("unavailable", "Unavailable");
		Tpl.setVar("hidden", "Hidden");
	}
	//If voting system enabled
	Tpl.setIf(
		"unavailable",
		appSettings.unavailableTab.active ||
			appSettings.unavailableTab.votingToolbar
	);

	//If the hidden tab system is activated
	Tpl.setIf("hidden", appSettings.hiddenTab.active);

	let tabsHtml = Tpl.render(tplTabs);
	$(tabs).prepend(tabsHtml);

	if (appSettings.hiddenTab.active) {
		//Add the toolbar for Hide All & Show All
		//Delete the previous one if any exist:
		$("#vh-tabs .hidden-toolbar").remove();
		//Generate the html for the hide all and show all widget
		let prom = await Tpl.loadFile("view/widget_hideall.html");
		Tpl.setVar("class", appSettings.thorvarium.darktheme ? "invert" : "");
		let content = Tpl.render(prom);
		$(content).prependTo("#vh-tabs");
		$(content).appendTo("#vh-tabs").css("margin-top", "5px");

		$(".vh-hideall").on("click", {}, this.hideAllItems);
		$(".vh-showall").on("click", {}, this.showAllItems);
	}

	//Actiate the tab system
	//Bind the click event for the tabs
	document.querySelectorAll("#tabs > ul li").forEach(function (item) {
		item.onclick = function (event) {
			currentTab = this.querySelector("a").href.split("#").pop();
			selectCurrentTab();
			this.classList.add("active");
		};
	});
	//Prevent links from being clickable
	document.querySelectorAll("#tabs > ul li a").forEach(function (item) {
		item.onclick = function (event) {
			event.preventDefault();
		};
	});
	selectCurrentTab(true);
}

async function hideAllItems() {
	let arrTile = [];
	let counter = 0;
	HiddenList.loadFromLocalStorage(); //Refresh the list in case it was altered in a different tab
	while ($("#vvp-items-grid .vvp-item-tile").children().length > 0) {
		tDom = $("#vvp-items-grid .vvp-item-tile").children()[0];
		asin = getAsinFromDom(tDom);
		arrTile.push({ asin, hidden: true });
		tile = getTileByAsin(asin); //Obtain the real tile
		await tile.hideTile(false, false); //Do not update local storage
	}
	HiddenList.saveList();
}

async function showAllItems() {
	let arrTile = [];
	HiddenList.loadFromLocalStorage(); //Refresh the list in case it was altered in a different tab
	while ($("#tab-hidden .vvp-item-tile").children().length > 0) {
		tDom = $("#tab-hidden .vvp-item-tile").children()[0];
		asin = getAsinFromDom(tDom);
		arrTile.push({ asin, hidden: false });
		tile = getTileByAsin(asin); //Obtain the real tile
		await tile.showTile(false, false); //Do not update local storage
	}
	HiddenList.saveList();
}

function selectCurrentTab(firstRun = false) {
	//Hide all tabs
	document.querySelectorAll(".tab-grid").forEach(function (item) {
		item.style.display = "none";
	});

	if (!firstRun) {
		document.querySelectorAll("#tabs > ul li").forEach(function (item) {
			item.classList.remove("active");
		});
	} else {
		document
			.querySelector("#tabs > ul li:first-child")
			.classList.add("active");
	}

	//Display the current tab
	document.querySelector("#" + currentTab).style.display = "grid";
}
