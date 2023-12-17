

//Create an array of all the products listed on the page
var arrUrl = [];
const regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.

$(".vvp-item-tile-content").each(function(){
	
	let url = $(this).find(".a-link-normal").attr("href");
	let pageId = url.match(regex);
	arrUrl.push(pageId[1]);

});
let jsonArrURL = JSON.stringify(arrUrl);
console.log(jsonArrURL);

//Post an AJAX request to the 3rd party server, passing along the JSON array of all the products on the page
url = "https://www.francoismazerolle.ca/vinehelper.php"
		+ "?data=" + jsonArrURL;
$.ajax(url,   // request url
			{
				crossDomain: true,
				headers: { /* Trying something, no change */
					'Access-Control-Allow-Origin': '*',
					"Referrer-Policy": "unsafe-url",
				},
				xhrFields: { /* Trying something, no change */
					withCredentials: true
				},
				beforeSend: function( xhr ) { /* Trying something, no change */
					xhr.setRequestHeader( "Referrer-Policy" , "unsafe-url" );
				},
				dataType: 'jsonp',
				jsonp: 'callback',
				jsonpCallback: 'jsonpServerResponse',
			}
		);

function jsonpServerResponse(data){
	//Print out the result from the ajax query.
	console.log(data);
}


