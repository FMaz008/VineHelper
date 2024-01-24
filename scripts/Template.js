
function Template(){
	var content = null;
	var arrVar = [];
	var arrIf = [];
	var lastUrl;
	
	this.loadFile = async function(url){
		lastUrl = url;
		var c;
		await fetch(url)
			.then(function(response) {
				return response.text();
			})
			.then(function(response) {
				c = response;
			})
			.catch( 
				function() {
					error =>  console.log(error);
				}
			);
		this.loadContent(c);
	}
	this.loadContent = function(html){
		content = html;
	}
	this.setVar = function(name, value){
		arrVar.push({"name":name, "value":value});
	}
	this.setIf = function(name, value){
		arrIf.push({"name":name, "value":value});
	}
	this.render = function(){
		if(content == null){
			console.log("No content for "+lastUrl+", did you await loadFile()) ?");
			return "";
		}
		var output = content;
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