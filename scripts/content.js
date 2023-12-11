
$('head').append( $('<link rel="stylesheet" type="text/css" />').attr('href', 'moz-extension://5951bf9a-25ae-4043-9fa2-54dc0ac1ce70/main.css') );

$(".vvp-item-tile-content").hover(function() {
	
	if ($(this).hasClass("ext-helper") == true) 
		return; //We already check for this item, we don't want to flood vine with XHR requests
	else
		$( this ).addClass( "ext-helper" ); //Add a class to the product card to avoid re-processing it
		
	$(this).prepend('<div class="ext-helper-status"><div class="ext-helper-status-container"><div class="ext-helper-status-icon"></div><span>Loading...</span></div></div>');
	
	
	//Find the item page URL:
	let url = $(this).find(".a-link-normal").attr("href");
	
	//Load the page via an Ajax request
	$.ajax(url,   // request url
		{
			context: this,
			success: function (data, status, xhr) {// success callback function
				parseDOM (this, data);
		}
	});
	
}, function() {});

function parseDOM(context, data){
		
	let normalImportFees = $(data).find("span#priceblock_ourprice_ifdmsg");
	if(normalImportFees.length>0){

		$( context ).find(".ext-helper-status-icon").addClass("ext-helper-icon-yes");
		$( context ).find(".ext-helper-status-container span").text(normalImportFees[0].innerText);
		$(context).find("img").css('opacity', '0.3');
		return;
	}
	
	let includedImportFees  = $(data).find("span#priceblock_dealprice_ifdmsg");
	if(includedImportFees.length>0){
		$( context ).find(".ext-helper-status-icon").addClass("ext-helper-icon-yes");
		$( context ).find(".ext-helper-status-container span").text("Deal price (Included import fees)");
		$(context).find("img").css('opacity', '0.3');
		return;
	}
	
	let variationsFormDetected  = $(data).find("div#twister_feature_div form#twister");
	if(variationsFormDetected.length>0){
		$( context ).find(".ext-helper-status-container span").text("Variations detected. Unable to guess.");
		return;
	}
	
	
	$( context ).find(".ext-helper-status-icon").addClass("ext-helper-icon-no");
	$( context ).find(".ext-helper-status-container span").text("No import fees detected");
		
}