


//Create an array of all the products listed on the page
var pageId; //Will be used to store the current pageId within the each loop.
var arrUrl = [];
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.

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



//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
let jsonArrURL = JSON.stringify(arrUrl);
let url = "https://www.francoismazerolle.ca/vinehelper.php"
		+ "?data=" + jsonArrURL;
fetch(url)
    .then((response) => response.json())
    .then(serverResponse);


function serverResponse(data){
	//Print out the result from the ajax query.
	console.log(data);
	//let arr = $.parseJSON(data); //convert to javascript array
	$.each(data,function(key,value){
		updateToolBarFees(key, value);
	});
}

function updateToolBarFees(pageId, fees){
	let context = $("#ext-helper-toolbar-" + pageId);
	
	//Remove the default icon
	let container = $(context).find("div.ext-helper-status-container");
	let icon = $(container).find(".ext-helper-icon");
	let span = $(container).find("span");
	let itemImg = $(context).parent(".vvp-item-tile-content").find("img");
	
	//Remove all images for the icon
	icon.removeClass("ext-helper-icon-info");
	icon.removeClass("ext-helper-icon-sad");
	icon.removeClass("ext-helper-icon-happy");
	
	if(fees==1){
		//The item has fees
		icon.addClass("ext-helper-icon-sad");
		span.text("Import fees reported");
		itemImg.css('opacity', '0.3');
	}else if(fees==0){
		//The item does not have fees
		icon.addClass("ext-helper-icon-happy");
		span.text("No import fees!");
	}else if(fees==null){
		//The item is not registered or needs more votes
		icon.addClass("ext-helper-icon-info");
		span.text("No data :-/");
	}
	
	//Regardless of the result, allow the user to vote or change their vote
	span.append(
		"<br />Any fees? "
		+ "<a href='#"+pageId+"' id='ext-helper-reportlink-"+pageId+"-yes' class='ext-helper-reportlink-bad' onclick='return false;'>"
			+ "&#11199; Yes"
		+ "</a> / "
		+ "<a href='#"+pageId+"' id='ext-helper-reportlink-"+pageId+"-no' class='ext-helper-reportlink-good' onclick='return false;'>"
			+ "&#9745; No"
		+ "</a>"
	);
		
	$("a#ext-helper-reportlink-"+pageId+"-yes").bind('click', { 'pageId': pageId, 'fees': 1 }, reportfees);
	$("a#ext-helper-reportlink-"+pageId+"-no").bind('click', { 'pageId': pageId, 'fees': 0 }, reportfees);

}



var reportfees = function(event){
	let pageId = event.data.pageId;
	let fees = event.data.fees;
	
	let url = "https://francoismazerolle.ca/vinehelperCastVote.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	fetch(url);

	updateToolBarFees(pageId, fees);
};

