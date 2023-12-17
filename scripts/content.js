
$('head').append( $('<link rel="stylesheet" type="text/css" />').attr('href', browser.runtime.getURL('/main.css') ));
//$('head').append( $('<script type="text/javascript" />').attr('src', browser.runtime.getURL('/scripts/content.js') ));

var i=0;
var arrUrl = [];
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/;

$(".vvp-item-tile-content").each(function(){
	
	let url = $(this).find(".a-link-normal").attr("href");
	let pageId = url.match(regex);
	arrUrl.push(pageId[1]);
	
	$(this).prepend(
		'<div class="ext-helper-status">'
			+ '<div class="ext-helper-status-container">'
				+ '<div class="ext-helper-icon ext-helper-icon-info"></div>'
				+ '<span>'
					+ '<a href="#" id="ext-helper-link-importfees-'+i+'" onclick="return false;">'
						+ 'Check import fees'
					+ '</a>'
				+ '</span>'
			+ '</div>'
		+ '</div>'
	);
	
	
	$("a#ext-helper-link-importfees-" + i).click(function(){
		let itemContext = $(this).parents(".vvp-item-tile-content");
		
		if ($(itemContext).hasClass("ext-helper") == true) 
			return; //We already check for this item, we don't want to flood vine with XHR requests
		else
			$(itemContext).addClass( "ext-helper" ); //Add a class to the product card to avoid re-processing it
			
		$(itemContext).find("div.ext-helper-status div span").text("Loading...");
		
		
		//Find the item page URL:
		let url = $(itemContext).find(".a-link-normal").attr("href");
		
		//Load the page via an Ajax request
		$.ajax(url,   // request url
			{
				context: itemContext,
				success: function (data, status, xhr) {// success callback function
					parseDOM (this, data);
				}
			}
		);
	});
	
	i++;
});
let jsonArrURL = JSON.stringify(arrUrl);
console.log(jsonArrURL);

//Post an AJAX request to the 3rd party server
url = "http://www.francoismazerolle.ca/vinehelper.php"
		+ "?data=" + jsonArrURL;
$.ajax(url,   // request url
			{
				crossDomain: true,
				dataType: 'jsonp',
				jsonp: 'callback',
				jsonpCallback: 'jsonpServerResponse',
			}
		);

function jsonpServerResponse(data){
	console.log(data);
}

function parseDOM(context, data){
	
	//remove the info icon
	$( context ).find(".ext-helper-icon").removeClass("ext-helper-icon-info");
	
	//Look for standard import fees
	let normalImportFees = $(data).find("span#priceblock_ourprice_ifdmsg");
	if(normalImportFees.length>0){

		$( context ).find(".ext-helper-icon").addClass("ext-helper-icon-yes");
		$( context ).find(".ext-helper-status-container span").text(normalImportFees[0].innerText);
		$(context).find("img").css('opacity', '0.3');
		return;
	}
	
	//Look for import fees included in the price
	let includedImportFees  = $(data).find("span#priceblock_dealprice_ifdmsg");
	if(includedImportFees.length>0){
		$( context ).find(".ext-helper-icon").addClass("ext-helper-icon-yes");
		$( context ).find(".ext-helper-status-container span").text("Deal price (Included import fees)");
		$(context).find("img").css('opacity', '0.3');
		return;
	}
	
	//Look if the item has variations
	let variationsFormDetected  = $(data).find("div#twister_feature_div form#twister");
	if(variationsFormDetected.length>0){
		$( context ).find(".ext-helper-status-container span").text("Variations detected. Unable to guess.");
		return;
	}
	
	//If nothing, it's likely to have no import fees
	$( context ).find(".ext-helper-icon").addClass("ext-helper-icon-no");
	$( context ).find(".ext-helper-status-container span").text("No import fees detected");
		
}