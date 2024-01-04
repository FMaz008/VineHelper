
//Intercept XHR requests
const origFetch = window.fetch;

let responseData = {};

//const proto = wrappedJSObject['fetch'].prototype;
window.fetch = async (...args) => {
  
  let response = await origFetch(...args);

  let regex = /^api\/recommendations\/.*$/;
  if(regex.test(args[0])){
	  console.log("URL match that of a product:", args[0]);
	  
	  await response
		.clone()
		.json()
		.then(function(data){
			responseData = data;
			})
		.catch(err => console.error(err));
		
	  //Check if the response has variants
	  if(responseData.result.variations !== undefined){
		  let variations = responseData.result.variations;
		  console.log(variations.length, " variations found.");
		  
		  //Check each variation
		  for (let i = 0; i < variations.length; ++i) {
			  let value = variations[i];
			  if(_.isEmpty(value.dimensions)){
				  console.log("Dimensions of variance", value.asin, " is empty, attempting to set defaut values.");
				  responseData.result.variations[i].dimensions = {"asin_no": value.asin};
			  }
		  }
	  }else{
		  console.log("This product has no variation.");
	  }
	  
	  //Return mocked response
	  return new Response(JSON.stringify(responseData));
  }else{
	  console.log("Request is not a product: ", args[0]);
	  return response;
  }
};