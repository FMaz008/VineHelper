
function Template(){
	var arrCache = [];
	var arrVar = [];
	var arrIf = [];
	var currentURL = null;
	
	this.loadFile = async function(url){
			
			currentURL = url;
			
			// Check if the content was already loading
			let entry = arrCache.find(e => e.url === url);
			if(entry == null){ // The template already exist, simply load it from memory
				//Content is not aready in arrCache, load it from the url
				const promise = fetch(url)
					.then(response => {
						if (!response.ok) throw new Error(response.statusText);
						//Reset the stored variables
						arrVar= [];
						arrIf = [];
						return response.text();
					});
				entry = { url, promise };
				arrCache.push(entry);
			}
			return entry.promise;
	}
	
	this.setVar = function( name, value){
		let variable = arrVar.find(e => e.name === name)
		if(variable == null)
			arrVar.push({"name":name, "value":value});
		else //Variable already exist, update the value.
			variable.value = value;
	}
	this.setIf = function( name, value){
		let variable = arrIf.find(e => e.name === name)
		if(variable == null)
			arrIf.push({"name":name, "value":value});
		else //Variable already exist, update the value.
			variable.value = value;
	}
	this.render = function(html){
		if(html == null){
			console.log(getRunTime() + "No content for "+currentURL+", did you await loadFile()) ?");
			return "";
		}
		var output = html;
		for(let i=0; i<arrVar.length; i++){
			output = output.replaceAll("{{$"+ arrVar[i]["name"] + "}}", arrVar[i]["value"]);
		}
		for(let j=0; j<arrIf.length; j++){
			if(arrIf[j]["value"] == true){
				//Remove the if tags
				output = output.replaceAll(new RegExp('{{if '+ arrIf[j]["name"] + '}}(.*?){{endif}}', 'sg'), `$1`);
			}else{
				//Remove the if block entirely
				output = output.replaceAll(new RegExp('{{if '+ arrIf[j]["name"] + '}}(.*?){{endif}}', 'sg'), "");
			}
			
		}
		
			
		return output;
	}
}

var Tpl = new Template();