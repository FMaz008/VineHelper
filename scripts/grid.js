
function Grid(obj)
{
	//Private variables
	var pGrid = obj;
	var pArrTile = [];
	
	//Private methods
	function getId(){
		return $(pGrid).attr("id");
	}
	
	//Public methods
	this.getId = function(){
		return getId();
	}
	
	this.getDOM = function(){
		return pGrid;
	};
	
	this.addTile = function(t){
		pArrTile.push(t);
	};
	
	this.removeTile = function(t){
		$.each(pArrTile, function(key, value){
			if(value != undefined && value.getAsin() == t.getAsin()){
				pArrTile.splice(key, 1);
			}
		});
	};
	
	this.getTileCount = function(trueCount=false){
		if(trueCount){
			return $(pGrid).children().length;
		}else{
			return pArrTile.length;
		}
	};
	
	this.getTileId = function(asin){
		var r = null;
		$.each(pArrTile, function(key, value){
			if(value != undefined && value.getAsin() == asin){
				r = value;
				return false; //Stop the loop
			}
		});
		return r;
	};
	
}


function updateTileCounts(){
	//Calculate how many tiles within each grids
	$("#ext-helper-available-count").text(gridRegular.getTileCount());
	
	if(appSettings.unavailableTab.active)
		$("#ext-helper-unavailable-count").text(gridUnavailable.getTileCount());
	
	if(appSettings.hiddenTab.active)
		$("#ext-helper-hidden-count").text(gridHidden.getTileCount());
}



function createGridInterface(){
	//Clean up interface (in case of the extension being reloaded)
	$("ul#ext-helper-tabs-ul").remove();
	$("div#tab-unavailable").remove();
	$("div#tab-hidden").remove();
	$(".ext-helper-status").remove(); //remove all toolbars
	
	//Implement the tab system.
	let tabs = $("<div>").attr("id","ext-helper-tabs").insertBefore("#vvp-items-grid");
	let ul = $("<ul>").attr("id","ext-helper-tabs-ul").appendTo(tabs);
	$("#vvp-items-grid").detach().appendTo(tabs);
	$("<li><a href=\"#vvp-items-grid\">Available (<span id='ext-helper-available-count'></span>)</a></li>").appendTo(ul);
	
	//If voting system enabled
	if(appSettings.unavailableTab.active){
		$("<li><a href=\"#tab-unavailable\">Unavailable (<span id='ext-helper-unavailable-count'></span>)</a></li>").appendTo(ul);
		$("<div />")
			.attr("id","tab-unavailable")
			.addClass("ext-helper-grid")
			.appendTo(tabs);
	}
	
	//If the hidden tab system is activated
	if(appSettings.hiddenTab.active){
		$("<li><a href=\"#tab-hidden\">Hidden (<span id='ext-helper-hidden-count'></span>)</a></li>").appendTo(ul);
		$("<div />")
			.attr("id","tab-hidden")
			.addClass("ext-helper-grid")
			.appendTo(tabs);
			
			
		//Add the toolbar for Hide All & Show All
		a1 = $("<a>")
			.attr("href", "#")
			.attr("onclick", "return false;")
			.html('<div class="ext-helper-toolbar-icon ext-helper-icon-hide"></div> Hide all')
			.on("click", {}, this.hideAllItems);
		a2 = $("<a>")
			.attr("href", "#")
			.attr("onclick", "return false;")
			.html('<div class="ext-helper-toolbar-icon ext-helper-icon-show"></div> Show all')
			.on("click", {}, this.showAllItems);
		$("<div>")
			.addClass("hidden-toolbar")
			.append("All items on this page:<br />")
			.append(a1, " / ", a2)
			.prependTo("#ext-helper-tabs");

	}
	
	//Actiate the tab system
	$( "#ext-helper-tabs" ).tabs();
	
}


async function hideAllItems(){
	if ($("#vvp-items-grid .vvp-item-tile").children().length == 0)
		return true;
	
	tDom = $("#vvp-items-grid .vvp-item-tile").children()[0];
	asin = getAsinFromDom(tDom);
	tile = getTileByAsin(asin); //Obtain the real tile 
	await tile.hideTile(false);
	
	hideAllItems();
}

async function showAllItems(){
	if ($("#tab-hidden .vvp-item-tile").children().length == 0)
		return true;
	
	tDom = $("#tab-hidden .vvp-item-tile").children()[0];
	asin = getAsinFromDom(tDom);
	tile = getTileByAsin(asin); //Obtain the real tile 
	await tile.showTile(false);
	
	showAllItems();
}