
let url = "https://www.francoismazerolle.ca/vinehelperStats.php";
fetch(url)
	.then((response) => response.json())
	.then(serverResponse)
	.catch( error =>  console.log(error) );


function serverResponse(data){
	let percentage = data["votes"]*100/data["totalVotes"];
	
	$("#votes").text(data["votes"]);
	$("#contribution").text(percentage.toFixed(3) + "%");
	$("#rank").text("#" + data["rank"]);
	$("#confirmed").text(data["totalConfirmed"]);
	$("#discarded").text(data["totalDiscarded"]);
}