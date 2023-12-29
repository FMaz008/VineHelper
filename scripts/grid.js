
function Grid(obj)
{
	//Private variables
	var pGrid = obj;
	var pArrTile = [];
	
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
			if(value != undefined && value.getPageId() == t.getPageId()){
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
	
	this.getTileId = function(pageId){
		var r = null;
		$.each(pArrTile, function(key, value){
			if(value != undefined && value.getPageId() == pageId){
				r = value;
				return false; //Stop the loop
			}
		});
		return r;
	};
	
}






function createDiscardGridInterface(){
	//Clean up interface (in case of the extension being reloaded)
	$("ul#ext-helper-tabs-ul").remove();
	$("div#tab-discarded").remove();
	$("div#tab-hidden").remove();
	$(".ext-helper-status").remove(); //remove all toolbars
	
	let tabs = $("<div>").attr("id","ext-helper-tabs").appendTo("#vvp-items-grid-container");
	let ul = $("<ul>").attr("id","ext-helper-tabs-ul").appendTo(tabs);
	$("#vvp-items-grid").detach().appendTo(tabs);
	$("<li><a href=\"#vvp-items-grid\">Available (<span id='ext-helper-available-count'></span>)</a></li>").appendTo(ul);
	$("<li><a href=\"#tab-discarded\">Unavailable (<span id='ext-helper-discarded-count'></span>)</a></li>").appendTo(ul);
	$("<li><a href=\"#tab-hidden\">Hidden (<span id='ext-helper-hidden-count'></span>)</a></li>").appendTo(ul);
	
	$("<div />")
		.attr("id","tab-discarded")
		.addClass("ext-helper-grid")
		.appendTo(tabs);
	$("<div />")
		.attr("id","tab-hidden")
		.addClass("ext-helper-grid")
		.appendTo(tabs);
	
	$( function() {
		$( "#ext-helper-tabs" ).tabs();
	} );
	
	
}
