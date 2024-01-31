
//Intercept Fetch requests
const origFetch = window.fetch;
var extHelper_LastParentVariant = null;
var extHelper_responseData = {};
var extHelper_postData = {};

//const proto = wrappedJSObject['fetch'].prototype;
window.fetch = async (...args) => {

	let response = await origFetch(...args);
	let lastParent = extHelper_LastParentVariant;
	let regex = null;
	
	regex = /^api\/voiceOrders/;
	if(regex.test(args[0])){
		//console.log("URL match that of an order.");
		extHelper_postData = JSON.parse(args[1].body);
		let asin = extHelper_postData.itemAsin;
		
		await response
			.clone()
			.json()
			.then(function(data){
				extHelper_responseData = data;
			})
			.catch(err => console.error(err));
		
		lastParent = extHelper_LastParentVariant;
		if(lastParent!=null){
			regex = /^.+?#(.+?)#.+$/;
			lastParent = extHelper_LastParentVariant.recommendationId.match(regex)[1];
		}
		
		let datap = extHelper_responseData;
		if(datap.error == null){
			//Order successful
			window.postMessage({type: "order", data: {
				"status": "success",
				"error": null,
				"parent_asin": lastParent,
				"asin": asin}}, "*");
		} else {//CROSS_BORDER_SHIPMENT.
				//SCHEDULED_DELIVERY_REQUIRED
				//ITEM_NOT_IN_ENROLLMENT
			window.postMessage({type: "order", data: {
				"status": "failed",
				"error": datap.error,
				"parent_asin": lastParent,
				"asin": asin}}, "*");
		} 
		//Wait 500ms following an order to allow for the order report query to go through before the redirect happens.
		await new Promise(r => setTimeout(r, 500));
	}
	
	regex = /^api\/recommendations\/.*$/;
	if(regex.test(args[0])){
		//console.log("URL match that of a product:", args[0]);
		
		await response
			.clone()
			.json()
			.then(function(data){
				extHelper_responseData = data;
				})
			.catch(err => console.error(err));
		
		
		//Intercept errors
		if(extHelper_responseData.result==null){
			if(extHelper_responseData.error != null){
				console.log(extHelper_responseData.error);
				if(extHelper_responseData.error.length != undefined){
					console.log(extHelper_responseData.error.length);
					if(typeof extHelper_responseData.error[0] === "object"){
						if(extHelper_responseData.error[0].exceptionType != undefined){
							window.postMessage({
								type: "error",
								data: {
									"error": extHelper_responseData.error[0].exceptionType
								}
							}, "*");
						}
					}
				}
			}
		}
		
		
		
		
		let datap = extHelper_responseData.result;
		
		//Find if the item is a parent
		if(datap.variations !== undefined){
			//The item has variation and so is a parent, store it for later interceptions
			extHelper_LastParentVariant = datap;
		}else if(datap.taxValue !== undefined){
			//The item has an ETV.
			//Is is either a child or a regular item
			let isChild = false;
			if(lastParent != null){
				//Check if this product is a child variant of the previous parent
				for(let i=0;i<lastParent.variations.length; ++i){
					if(lastParent.variations[i].asin == datap.asin)
						isChild = true;
				}
			}
			
			if(isChild){
				regex = /^.+?#(.+?)#.+$/;
				let arrMatchesP = lastParent.recommendationId.match(regex);
				
				window.postMessage({type: "etv", data: {
					"parent_asin": arrMatchesP[1],
					"asin": datap.asin,
					"etv": datap.taxValue}}, "*");
			}else{
				extHelper_LastParentVariant = null;
				window.postMessage({type: "etv", data: {
					"parent_asin": null,
					"asin": datap.asin,
					"etv": datap.taxValue}}, "*");
			}
		}
		
		
		
		
		//console.log(extHelper_responseData .result);
		//Fix the infinite spinning wheel
		//Check if the response has variants
		if(extHelper_responseData.result.variations !== undefined){
			let variations = extHelper_responseData.result.variations;
			//console.log(variations.length, " variations found.");
		  
			//Check each variation
			let fixed = 0;
			for (let i = 0; i < variations.length; ++i) {
				let value = variations[i];
				if(_.isEmpty(value.dimensions)){
					//console.log("Dimensions of variance", value.asin, " is empty, attempting to set defaut values.");
					extHelper_responseData.result.variations[i].dimensions = {"asin_no": value.asin};
					fixed++;
				}
			}
			
			if(fixed > 0){
				var data = { type: "infiniteWheelFixed", text: fixed + " variation(s) fixed." };
				window.postMessage(data, "*");
			}
		}else{
			//console.log("This product has no variation.");
		}
		
		//Return mocked response
		return new Response(JSON.stringify(extHelper_responseData));
	}else{
		
		//console.log("Request is not a product: ", args[0]);
		return response;
	}
};