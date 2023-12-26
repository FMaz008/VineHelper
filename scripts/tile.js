

function Tile(obj, gridInstance){
	
	//private properties
	var pTile = obj;
	var pPageId = findPageId();
	var pGrid = gridInstance;
	pGrid.addTile(this);
	var pToolbar = null;
	
	var pVoteFees = 0;
	var pVoteNoFees = 0;
	var pVoteOwn = null;
	
	//Private method
	function findPageId(){
		let regex = /^(?:.*\/dp\/)(.+?)(?:\?.*)?$/; //Isolate the product ID in the URL.
		let url = $(pTile).find(".a-link-normal").attr("href");
		let arrPageId = url.match(regex);
		return arrPageId[1];
	}
	
	function getFees(){
		if(pVoteFees - pVoteNoFees >= consensusThreshold)
			return CONSENSUS_FEES;
		else if(pVoteNoFees - pVoteFees >= consensusThreshold)
			return CONSENSUS_NO_FEES;
		else
			return NO_CONSENSUS;
	}
	
	//Public methods
	this.setToolbar = function(toolbarInstance){
		pToolbar = toolbarInstance;
	}
	this.getToolbar = function(){
		return pToolbar;
	}
	
	this.setVotes = function(no, yes, own){
		pVoteFees = yes;
		pVoteNoFees = no;
		pVoteOwn = own;
	};
	
	this.getVoteFees = function(){
		return pVoteFees;
	};
	this.getVoteNoFees = function(){
		return pVoteNoFees;
	};
	this.getVoteOwn = function(){
		return pVoteOwn;
	};
	
	this.getFees = function(){
		return getFees();
	};
	
	this.getStatus = function(){
		if(getFees() == CONSENSUS_FEES)
			return DISCARDED_WITH_FEES;
		
		if(pVoteOwn == 1 && selfDiscard)
			return DISCARDED_OWN_VOTE;
		
		if(getFees() == CONSENSUS_NO_FEES)
			return NOT_DISCARDED_NO_FEES;
		
		if(pVoteOwn == 0)
			return NOT_DISCARDED_OWN_VOTE;
		
		return NOT_DISCARDED_NO_STATUS;
	};
	
	this.getPageId = function(){
		return pPageId;
	};
	
	this.getDOM = function(){
		return pTile;
	};
	
	this.getGrid = function(){
		return pGrid;
	};
	
	this.getGridId = function(){
		return pGrid.getId();
	};
	
	this.moveToGrid = async function(g, animate = false){
		//If we are asking to move the tile to the same grid, don't do anything
		if(g.getId() == pGrid.getId())
			return false; 
		
		if(pGrid != null){
			pGrid.removeTile(this);
		}
		pGrid = g;
		pGrid.addTile(this);
		
		if(animate)
			await animateVanish($(pTile)); //Will hide the tile
		
		//console.log( pPageId + ' Will be moved to grid ' + "#" + $(pGrid.getDOM()).attr("id"));
		$(pTile).detach().appendTo("#" + $(pGrid.getDOM()).attr("id"));
		$(pTile).show();
	};
}
