


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
	$(context).find(".ext-helper-icon").removeClass("ext-helper-icon-info");
	
	if(fees==1){
		//The item has fees
		$(context).find(".ext-helper-icon").addClass("ext-helper-icon-yes");
		$(context).find("div.ext-helper-status-container span").text("Import fees reported");
		$(context).parent(".vvp-item-tile-content").find("img").css('opacity', '0.3');
	}else if(fees==0){
		//The item does not have fees
		$(context).find(".ext-helper-icon").addClass("ext-helper-icon-no");
		$(context).find("div.ext-helper-status-container span").text("No import fees!");
	}else if(fees==null){
		//The item is not registered or needs more votes
		$(context).find(".ext-helper-icon").addClass("ext-helper-icon-info");
		$(context).find("div.ext-helper-status-container span").html(
			"No data :-/<br />"
			+ "Any fees? "
			+ "<a href='#"+pageId+"' id='ext-helper-reportlink-"+pageId+"-yes' onclick='return false;'>Yes</a> / "
			+ "<a href='#"+pageId+"' id='ext-helper-reportlink-"+pageId+"-no' onclick='return false;'>No</a>"
		);
		
		$("a#ext-helper-reportlink-"+pageId+"-yes").bind('click', { 'pageId': pageId, 'fees': 1 }, reportfees);
		$("a#ext-helper-reportlink-"+pageId+"-no").bind('click', { 'pageId': pageId, 'fees': 0 }, reportfees);
	}
}



var reportfees = function(event){
	let pageId = event.data.pageId;
	let fees = event.data.fees;
	
	let url = "https://francoismazerolle.ca/vinehelperCastVote.php"
		+ '?data={"url":"' + pageId +'","fees":'+ fees +'}';
	fetch(url);

	updateToolBarFees(pageId, fees);
};

