/** Convert the format "2024-10-03 17:00:45" to
 * a new Date object constructed with "2024-10-04T17:00:45Z"
 * */
export function YMDHiStoISODate(datetime) {
	//Used by Tile.js
	return new Date(datetime.replace(" ", "T") + "Z");
}

/** Convert UTC MySQL datetime format "2024-11-28T12:29:45.000Z" to
 * a local datetime string in format "YYYY-MM-DD HH:mm:ss"
 * @param {string} utcDatetime - The UTC datetime string from MySQL
 * @returns {string} Local datetime string
 */
export function ISODatetoYMDHiS(utcDatetime) {
	const date = new Date(utcDatetime);
	return (
		date.getFullYear() +
		"-" +
		String(date.getMonth() + 1).padStart(2, "0") +
		"-" +
		String(date.getDate()).padStart(2, "0") +
		" " +
		String(date.getHours()).padStart(2, "0") +
		":" +
		String(date.getMinutes()).padStart(2, "0") +
		":" +
		String(date.getSeconds()).padStart(2, "0")
	);
}

export function UnixTimeStampToDate(timestamp, format = "YY/MM/DD HH:ii") {
	const date = new Date(timestamp * 1000);

	// Get hours in 12-hour format and AM/PM
	const hours24 = date.getHours();
	const hours12 = hours24 % 12 || 12; // Convert 0 to 12 for midnight
	const ampm = hours24 >= 12 ? "PM" : "AM";

	const formatMap = {
		YYYY: date.getFullYear(),
		YY: date.getFullYear().toString().slice(-2),
		MM: String(date.getMonth() + 1).padStart(2, "0"),
		DD: String(date.getDate()).padStart(2, "0"),
		HH: String(hours24).padStart(2, "0"), // 24-hour format
		hh: String(hours12).padStart(2, "0"), // 12-hour format
		ii: String(date.getMinutes()).padStart(2, "0"),
		ss: String(date.getSeconds()).padStart(2, "0"),
		A: ampm, // AM/PM
		a: ampm.toLowerCase(), // am/pm
	};

	let formattedDate = format;
	for (const [key, value] of Object.entries(formatMap)) {
		formattedDate = formattedDate.replace(key, value);
	}

	return formattedDate;
}

export function DateToUnixTimeStamp(date) {
	return Math.floor(date.getTime() / 1000);
}
