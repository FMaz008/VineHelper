/** Convert the format "2024-10-03 17:00:45" to
 * a new Date object constructed with "2024-10-04T17:00:45Z"
 * */
export function YMDHiStoISODate(datetime) {
	//Used by Tile.js
	return new Date(datetime.replace(" ", "T") + "Z");
}
