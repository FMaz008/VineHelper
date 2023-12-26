
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
	$("div#discardedItems").remove();
	$(".ext-helper-separator").remove();
	$(".ext-helper-status").remove(); //remove all toolbars
	
	$("<div />")
		.attr("id","discardedItems")
		.insertBefore("#vvp-items-grid");
	$("<br /><hr /><br />")
		.addClass("ext-helper-separator")
		.insertBefore("#vvp-items-grid");
	$("<div />")
		.attr("id", "ext-helper-grid-header")
		.text(" discarded item(s)")
		.appendTo("#discardedItems");
	$("<div />")
		.attr("id", "ext-helper-grid")
		.hide() //Hide at first
		.appendTo("#discardedItems");
	$("<span />")
		.attr("id", "ext-helper-grid-count")
		.prependTo("#ext-helper-grid-header");
	$("<span />")
		.attr("id", "ext-helper-grid-collapse-indicator")
		.html("&#11166;")
		.prependTo("#ext-helper-grid-header");
	
	//Collapse/toggle function
	$("#ext-helper-grid-header").on('click', {}, function(){
		$('#ext-helper-grid').toggle();
		if($('#ext-helper-grid').is(":hidden")){
			$("#ext-helper-grid-collapse-indicator").html("&#11166;");	
		}else{
			$("#ext-helper-grid-collapse-indicator").html("&#11167;");
		}
	});
	
}
