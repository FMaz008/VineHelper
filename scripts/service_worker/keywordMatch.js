function keywordMatch(keywords, title, etv_min = null, etv_max = null) {
	let found = keywords.find((word) => {
		let regex;
		let regex2;
		if (typeof word == "string") {
			//Old data format where each keyword was a string
			try {
				regex = new RegExp(`\\b${word}\\b`, "i");
			} catch (error) {
				if (error instanceof SyntaxError) {
					return false;
				}
			}

			if (regex.test(title)) {
				return true;
			}
		} else if (typeof word == "object") {
			//New data format where keywords are objects
			try {
				regex = new RegExp(`\\b${word.contains}\\b`, "i");
				regex2 = new RegExp(`\\b${word.without}\\b`, "i");
			} catch (error) {
				if (error instanceof SyntaxError) {
					return false;
				}
			}

			if (regex.test(title)) {
				if (word.without == "" || !regex2.test(title)) {
					if (word.etv_min == "" && word.etv_max == "") {
						//There is ETV filtering defined, we have a match.
						return true;
					} else {
						//There is an ETV filtering defined, we need to satisfy it
						if (word.etv_min == "" || (etv_min !== null && etv_min >= parseFloat(word.etv_min))) {
							if (word.etv_max == "" || (etv_max !== null && etv_max <= parseFloat(word.etv_max))) {
								return true;
							}
						}
					}
				}
			}
		}

		return false; // Continue searching
	});
	if (typeof found === "object") {
		found = found.contains;
	}
	return found === undefined ? false : found;
}

export { keywordMatch };
