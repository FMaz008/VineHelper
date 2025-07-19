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

export function removeSpecialHTML(string) {
	//Remove all special characters
	string = string.replace(/[^\w\s.-]/g, " ");

	return string;
}

export function escapeHTML(string) {
	// Add defensive check for null/undefined
	if (!string) {
		return '';
	}
	
	// Convert to string if not already
	string = String(string);
	
	//Escape all special characters
	return string.replace(
		/[&<>"']/g,
		(char) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[char]
	);
}
