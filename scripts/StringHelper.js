export function unescapeHTML(encodedString) {
	const entityMap = {
		"&amp;": "&",
		"&#34;": '"',
		"&#39;": "'",
	};

	// Use a for...in loop for better performance
	for (const key in entityMap) {
		const value = entityMap[key];
		encodedString = encodedString.split(key).join(value);
	}

	return encodedString;
}