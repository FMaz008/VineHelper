



var pageId; //Will be used to store the current pageId within the each loop.
var arrUrl = []; //Will be use to store the URL identifier of the listed products.
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
const consensusThreshold = 2;


function createInterface(){
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
		.text(" item(s) voted with fees")
		.appendTo("#discardedItems");
	$("<div />")
		.attr("id", "ext-helper-grid")
		.appendTo("#discardedItems");
	$("<span />")
		.attr("id", "ext-helper-grid-count")
		.prependTo("#ext-helper-grid-header");
	$("<span />")
		.attr("id", "ext-helper-grid-collapse-indicator")
		.prependTo("#ext-helper-grid-header");
	
	$("#ext-helper-grid-header").bind('click', {}, toggleDiscardedList);
	toggleDiscardedList(); //Hide at first
}

function toggleDiscardedList(){
	$('#ext-helper-grid').toggle();
	if($('#ext-helper-grid').is(":hidden")){
		$("#ext-helper-grid-collapse-indicator").html("&#11166;");	
	}else{
		$("#ext-helper-grid-collapse-indicator").html("&#11167;");
	}
}

function createProductToolbar(attachTo, pageId){
	let toolbarId = "ext-helper-toolbar-" + pageId;
	$("<div />")
		.attr("id",toolbarId)
		.addClass("ext-helper-status")
		.prependTo(attachTo);
	$("<div />")
		.addClass("ext-helper-status-container")
		.appendTo("#"+toolbarId);
	$("<div />")
		.addClass("ext-helper-icon ext-helper-icon-info")
		.appendTo("#"+toolbarId + " .ext-helper-status-container");
	$("<div />")
		.addClass("ext-helper-status-container2")
		.text("Loading...")
		.appendTo("#"+toolbarId + " .ext-helper-status-container");
}

function createVotingWidget(pageId, votesFees, votesNoFees, voteUser){
	let context = $("#ext-helper-toolbar-" + pageId);
	let container = $(context).find("div.ext-helper-status-container2");
	
	let pe; //Parent Element
	let v1, v0; //VoteFees(1), VoteNoFees(0)
	pe = $("<div />").text("Any fees? ").appendTo(container);
	v1 = $("<a />")
		.attr("href", "#" + pageId)
		.attr("id", "ext-helper-reportlink-"+pageId+"-yes")
		.addClass("ext-helper-reportlink-bad")
		.attr("onclick", "return false;")
		.html("&#11199; Yes ("+votesFees+")")
		.appendTo(pe);
	$("<span />")
		.text(" / ")
		.appendTo(pe);
	v0 = $("<a />")
		.attr("href", "#" + pageId)
		.attr("id", "ext-helper-reportlink-"+pageId+"-no")
		.addClass("ext-helper-reportlink-good")
		.attr("onclick", "return false;")
		.html("&#9745; No ("+votesNoFees+")")
		.appendTo(pe);
	
	v1.bind('click', { 'pageId': pageId, 'fees': 1, 'v1': votesFees, 'v0':votesNoFees}, reportfees);
	v0.bind('click', { 'pageId': pageId, 'fees': 0, 'v1': votesFees, 'v0':votesNoFees }, reportfees);


	//Make the widget transparent if the user voted "no fees"
	//Note: If we voted "fees", the entire card will be transparent.
	//      If we have not voted, we want the option to remain visible.
	pe.css('opacity', (voteUser == 0) ? 0.4 : 1.0); 
	
	//If the user has already voted, add the selected class to the vote link
	if(voteUser == 1){
		v1.addClass("selectedVote");
	}
	if(voteUser == 0){
		v0.addClass("selectedVote");
	}
}

function moveProductTileToDiscardedGrid(pageId){
	let tile = $("#ext-helper-toolbar-" + pageId).parents(".vvp-item-tile");
	$(tile).detach().appendTo('#ext-helper-grid');
}

createInterface();



//Browse each items from the list
//Create an array of all the products listed on the page
$(".vvp-item-tile-content").each(function(){
	
	let url = $(this).find(".a-link-normal").attr("href");
	let arrPageId = url.match(regex);
	pageId = arrPageId[1];
	arrUrl.push(pageId);

	createProductToolbar(this, pageId);
});

fetchData(arrUrl);


//Get data from the server about the products listed on this page
function fetchData(arrUrl){
	let arrJSON = {"api_version":2, "arr_url":arrUrl};
	let jsonArrURL = JSON.stringify(arrJSON);
	
	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://www.francoismazerolle.ca/vinehelper_v2.php"
			+ "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(serverResponse)
		.catch( error =>  console.log(error) );
}

function serverResponse(data){
	//let arr = $.parseJSON(data); //convert to javascript array
	if(data["api_version"]!=2){
		console.log("Wrong API version");
	}
	
	$.each(data["arr_url"],function(key,values){
		
		//If there is a consensus of a fee for the product, move it to the discarded grid
		if(values['f'] == 1){
			moveProductTileToDiscardedGrid(key);
		}
		
		//Update the toolbar with the information received
		updateToolBarFees(key, values);
	});
	
	//Calculate how many tiles were moved to the discarded grid
	$("#ext-helper-grid-count").text($("#ext-helper-grid").children().length);
}

function updateToolBarFees(pageId, arrValues){
	let context = $("#ext-helper-toolbar-" + pageId);
	let icon = $(context).find(".ext-helper-icon");
	let container = $(context).find("div.ext-helper-status-container2");
	
	let fees = arrValues["f"];
	let voteUser = arrValues["s"];
	let votesFees = arrValues["v1"];
	let votesNoFees = arrValues["v0"];
	
	
	//Remove all images for the icon
	icon.removeClass("ext-helper-icon-info");
	icon.removeClass("ext-helper-icon-sad");
	icon.removeClass("ext-helper-icon-happy");
	
	let tileOpacity;
	let statusText;
	let statusIcon;
	if(fees==1 || (fees==null && voteUser==1)){
		//The item has fees
		statusIcon = "ext-helper-icon-sad";
		statusText = "Import fees reported";
		tileOpacity = 0.3;
	}else if(fees==0 || (fees==null && voteUser==0)){
		//The item does not have fees
		statusIcon = "ext-helper-icon-happy";
		statusText = "No import fees!";
		tileOpacity = 1.0;
	}else if(fees==null){
		//The item is not registered or needs more votes
		statusIcon = "ext-helper-icon-info";
		statusText = "Not enough data :-/";
		tileOpacity = 1.0;
	}
	
	$(context).parent(".vvp-item-tile-content").css('opacity', tileOpacity);
	icon.addClass(statusIcon);
	container.text(statusText);
	
	createVotingWidget(pageId, votesFees, votesNoFees, voteUser);
}



async function reportfees(event){
	let pageId = event.data.pageId;
	let fees = event.data.fees;
	
	let url = "https://francoismazerolle.ca/vinehelperCastVote_v2.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	await fetch(url); //Await to wait until the vote to have been processed before refreshing the display

	let arrUrl = [pageId];
	fetchData(arrUrl); //Refresh the toolbar for that specific product only
};

