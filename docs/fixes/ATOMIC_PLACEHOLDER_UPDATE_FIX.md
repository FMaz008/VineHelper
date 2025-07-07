# Atomic Placeholder Update Fix

## Problem

When filters were changed in the notification monitor, placeholders were being calculated and added AFTER the grid sort operation completed. This caused a visual "jump" or shift in the grid as placeholders appeared after the items were already displayed.

## Root Cause

The grid sort operation was happening in two phases:

1. `#handleSortNeeded` would sort items and preserve existing placeholders
2. `grid:sorted` event would trigger `#handleGridSorted` which would then recalculate placeholders

This two-phase approach meant users would see:

1. Grid with sorted items (no/wrong placeholders)
2. Brief pause
3. Grid shift as placeholders were added

## Solution

Integrated placeholder calculation directly into the sort operation to make it atomic:

1. **Modified `#handleSortNeeded` in GridEventManager**:
    - Calculate the correct number of placeholders BEFORE building the DOM fragment
    - Count visible items during the sort operation
    - Create/reuse/remove placeholders as needed
    - Add everything to the DOM in one operation

2. **Added `placeholdersHandled` flag**:
    - Pass this flag in the `grid:sorted` event
    - `#handleGridSorted` skips placeholder updates when this flag is true
    - Prevents duplicate placeholder calculations

3. **Added public methods to NoShiftGrid**:
    - `getTilesPerRow()` - Calculate tiles per row using cached values
    - `createPlaceholderTile()` - Create a single placeholder element

## Implementation Details

### GridEventManager Changes

```javascript
// Calculate placeholders during sort
let placeholdersNeeded = 0;
if (this.#monitor._sortType === "date_desc" && this.#noShiftGrid) {
	const visibleCount = sortedItems.filter((item) => {
		const element = asinToElement.get(item.asin);
		return element && element.style.display !== "none";
	}).length;

	const tilesPerRow = this.#noShiftGrid.getTilesPerRow();
	if (tilesPerRow > 0 && visibleCount > 0) {
		const remainder = visibleCount % tilesPerRow;
		placeholdersNeeded = remainder > 0 ? tilesPerRow - remainder : 0;
	}
}

// Create exact number of placeholders needed
const placeholderTiles = [];
// Reuse existing placeholders
for (let i = 0; i < Math.min(existingPlaceholders.length, placeholdersNeeded); i++) {
	placeholderTiles.push(existingPlaceholders[i]);
}
// Create new ones if needed
for (let i = existingPlaceholders.length; i < placeholdersNeeded; i++) {
	placeholderTiles.push(this.#noShiftGrid.createPlaceholderTile());
}
// Remove excess placeholders
for (let i = placeholdersNeeded; i < existingPlaceholders.length; i++) {
	existingPlaceholders[i].remove();
}
```

### NoShiftGrid Additions

```javascript
getTilesPerRow() {
    if (!this._gridContainer) return 0;

    const cachedWidth = this._getCachedTileWidth();
    if (cachedWidth) {
        return Math.floor(this._gridWidth / cachedWidth) || 1;
    }

    const firstTile = this._gridContainer.querySelector(".vvp-item-tile:not(.vh-placeholder-tile)");
    if (!firstTile) return 1;

    const tileWidth = this._getTileWidth(firstTile);
    return Math.floor(this._gridWidth / tileWidth) || 1;
}

createPlaceholderTile() {
    const placeholder = document.createElement("div");
    placeholder.className = "vh-placeholder-tile vvp-item-tile vh-logo-vh";
    return placeholder;
}
```

## Benefits

1. **No visual jump**: Placeholders appear simultaneously with sorted items
2. **Better performance**: Single DOM operation instead of two
3. **Cleaner architecture**: Sort operation handles all grid layout in one place
4. **Reuses existing placeholders**: Minimizes DOM manipulation

## Testing

1. Change filters in the notification monitor
2. Observe that the grid appears with the correct placeholders immediately
3. No visual shift or jump should occur
4. Placeholders should complete the last row of the grid

## Related Files

- `scripts/notifications-monitor/services/GridEventManager.js`
- `scripts/notifications-monitor/services/NoShiftGrid.js`
