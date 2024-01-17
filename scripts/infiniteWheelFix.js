
//Intercept Fetch requests
const origFetch = window.fetch;
var extHelper_LastParentVariant = null;

let responseData = {};

//const proto = wrappedJSObject['fetch'].prototype;
window.fetch = async (...args) => {
  
  let response = await origFetch(...args);

  let regex = /^api\/recommendations\/.*$/;
  if(regex.test(args[0])){
	  //console.log("URL match that of a product:", args[0]);
	  
	  await response
		.clone()
		.json()
		.then(function(data){
			responseData = data;
			})
		.catch(err => console.error(err));
	
		let datap = responseData.result;
		let lastParent = extHelper_LastParentVariant;
		
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
				window.postMessage({type: "etv", data: {
													"parent_asin": null,
													"asin": datap.asin,
													"etv": datap.taxValue}}, "*");
			}
		}
		
		
		
		
	  //console.log(responseData.result);
	  //Fix the infinite spinning wheel
	  //Check if the response has variants
	  if(responseData.result.variations !== undefined){
		  let variations = responseData.result.variations;
		  //console.log(variations.length, " variations found.");
		  
		  //Check each variation
		  let fixed = 0;
		  for (let i = 0; i < variations.length; ++i) {
			  let value = variations[i];
			  if(_.isEmpty(value.dimensions)){
				  //console.log("Dimensions of variance", value.asin, " is empty, attempting to set defaut values.");
				  responseData.result.variations[i].dimensions = {"asin_no": value.asin};
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
	  return new Response(JSON.stringify(responseData));
  }else{
	  //console.log("Request is not a product: ", args[0]);
	  return response;
  }
};