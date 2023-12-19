


//Create an array of all the products listed on the page
var pageId; //Will be used to store the current pageId within the each loop.
var arrUrl = [];
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.

$("<div id=\"discardedItems\"><div id=\"ext-helper-grid-header\"><span id=\"ext-helper-grid-collapse-indicator\"></span> <span id=\"ext-helper-grid-count\"></span> item(s) voted with fees</div><div id=\"ext-helper-grid\"></div></div><br /><hr /><br />").insertBefore("#vvp-items-grid");

$("#ext-helper-grid-header").bind('click', {}, toggleDiscardedList);
toggleDiscardedList(); //Hide at first

function toggleDiscardedList(){
	$('#ext-helper-grid').toggle();
	if($('#ext-helper-grid').is(":hidden")){
		$("#ext-helper-grid-collapse-indicator").html("&#11166;");	
	}else{
		$("#ext-helper-grid-collapse-indicator").html("&#11167;");
	}
}

$(".vvp-item-tile-content").each(function(){
	
	let url = $(this).find(".a-link-normal").attr("href");
	let arrPageId = url.match(regex);
	pageId = arrPageId[1];
	arrUrl.push(pageId);

	$(this).prepend(
		'<div id="ext-helper-toolbar-' + pageId + '" class="ext-helper-status">'
			+ '<div class="ext-helper-status-container">'
				+ '<div class="ext-helper-icon ext-helper-icon-info"></div>'
				+ '<span>Loading...</span>'
			+ '</div>'
		+ '</div>'
	);
	
});

fetchData(arrUrl);

function fetchData(arrUrl){
	let arrJSON = {"api_version":2, "arr_url":arrUrl};
	let jsonArrURL = JSON.stringify(arrJSON);
	
	//console.log("Outgoing request");
	//console.log(jsonArrURL);
	
	//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
	let url = "https://www.francoismazerolle.ca/vinehelper_v2.php"
			+ "?data=" + jsonArrURL;
	fetch(url)
		.then((response) => response.json())
		.then(serverResponse)
		.catch( error =>  console.log(error) );
}

function serverResponse(data){
	//console.log("Response");
	//console.log(data);
	//let arr = $.parseJSON(data); //convert to javascript array
	if(data["api_version"]!=2){
		console.log("Wrong API version");
	}
	
	$.each(data["arr_url"],function(key,values){
		if(values['f'] == 1){
			let tile = $("#ext-helper-toolbar-" + key).parents(".vvp-item-tile");
			$(tile).detach().appendTo('#ext-helper-grid');
		}
		updateToolBarFees(key, values);
	});
	
	$("#ext-helper-grid-count").text($("#ext-helper-grid").children().length);
}

function updateToolBarFees(pageId, arrValues){
	let context = $("#ext-helper-toolbar-" + pageId);
	let fees = arrValues["f"];
	let vote = arrValues["s"];
	let voteCountFees = arrValues["v1"];
	let voteCountNoFees = arrValues["v0"];
	
	//Remove the default icon
	let container = $(context).find("div.ext-helper-status-container");
	let icon = $(container).find(".ext-helper-icon");
	let span = $(container).find("span");
	
	//Remove all images for the icon
	icon.removeClass("ext-helper-icon-info");
	icon.removeClass("ext-helper-icon-sad");
	icon.removeClass("ext-helper-icon-happy");
	
	let divVoteStyle = "";
	$(context).parent(".vvp-item-tile-content").css('opacity', '1')
	if(fees==1 || (fees==null && vote==1)){
		//The item has fees
		icon.addClass("ext-helper-icon-sad");
		span.text("Import fees reported");
		$(context).parent(".vvp-item-tile-content").css('opacity', '0.3')
	}else if(fees==0 || (fees==null && vote==0)){
		//The item does not have fees
		icon.addClass("ext-helper-icon-happy");
		span.text("No import fees!");
		divVoteStyle = "opacity:0.6";
	}else if(fees==null){
		//The item is not registered or needs more votes
		icon.addClass("ext-helper-icon-info");
		span.text("No data :-/");
	}
	
	let sadVoteClass = "";
	let happyVoteClass = "";
	if(vote == 1)
		sadVoteClass = "selectedVote";
	if(vote==0)
		happyVoteClass = "selectedVote";
	
	//Regardless of the result, allow the user to vote or change their vote
	span.append(
		"<div style='"+divVoteStyle+"'>Any fees? "
		+ "<a href='#"+pageId+"' id='ext-helper-reportlink-"+pageId+"-yes' class='ext-helper-reportlink-bad "+sadVoteClass+"' onclick='return false;'>"
			+ "&#11199; Yes ("+voteCountFees+")"
		+ "</a> / "
		+ "<a href='#"+pageId+"' id='ext-helper-reportlink-"+pageId+"-no' class='ext-helper-reportlink-good "+happyVoteClass+"' onclick='return false;'>"
			+ "&#9745; No ("+voteCountNoFees+")"
		+ "</a>"
	);
		
	$("a#ext-helper-reportlink-"+pageId+"-yes").bind('click', { 'pageId': pageId, 'fees': 1, 'v1': voteCountFees, 'v0':voteCountNoFees}, reportfees);
	$("a#ext-helper-reportlink-"+pageId+"-no").bind('click', { 'pageId': pageId, 'fees': 0, 'v1': voteCountFees, 'v0':voteCountNoFees }, reportfees);

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

