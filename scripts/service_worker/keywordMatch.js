function keywordMatchReturnFullObject(keywords, title, etv_min = null, etv_max = null) {
	let found = keywords.find((word) => {
		let regex;
		let regex2;
		if (typeof word == "string") {
			//Old data format where each keyword was a string
			try {
				const pattern = /^[\x20-\x7E]+$/.test(word)
					? `\\b${word}\\b`
					: `(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`;
				regex = new RegExp(pattern, "iu");
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
				//Check if the keyword contains non-ASCII characters
				//If it does, use a regex pattern supporting japanese characters
				const pattern = /^[\x20-\x7E]+$/.test(word.contains)
					? `\\b${word.contains}\\b`
					: `(?<![\\p{L}\\p{N}])${word.contains}(?![\\p{L}\\p{N}])`;
				regex = new RegExp(pattern, "iu");
				const pattern2 = /^[\x20-\x7E]+$/.test(word.without)
					? `\\b${word.without}\\b`
					: `(?<![\\p{L}\\p{N}])${word.without}(?![\\p{L}\\p{N}])`;
				regex2 = new RegExp(pattern2, "iu");
			} catch (error) {
				if (error instanceof SyntaxError) {
					return false;
				}
			}

			if (regex.test(title)) {
				if (word.without == "" || !regex2.test(title)) {
					if (word.etv_min == "" && word.etv_max == "") {
						//There is no ETV filtering defined, we have a match.
						return true;
					} else {
						//There is an ETV filtering defined, we need to satisfy it.
						//etv_min and etv_max are the values returned by the server.
						//word.etv_min and word.etv_max are from the user.
						//For the user's ETV min, match if any variations match (compare against highest ETV, etv_max.)
						//For the user's ETV max, match if any variations match (compare against lowest ETV, etv_min.)
						if (
							word.etv_min == "" ||
							(etv_max !== null && etv_max !== "" && etv_max >= parseFloat(word.etv_min))
						) {
							if (
								word.etv_max == "" ||
								(etv_min !== null && etv_min !== "" && etv_min <= parseFloat(word.etv_max))
							) {
								return true;
							}
						}
					}
				}
			}
		}

		return false; // Continue searching
	});
	return found;
}

function keywordMatch(keywords, title, etv_min = null, etv_max = null) {
	let found = keywordMatchReturnFullObject(keywords, title, etv_min, etv_max);

	if (typeof found === "object") {
		found = found.contains;
	}
	return found === undefined ? false : found;
}

export { keywordMatch, keywordMatchReturnFullObject };
