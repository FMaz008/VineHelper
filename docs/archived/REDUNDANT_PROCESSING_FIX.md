# Redundant Processing Fix for NotificationMonitor

## Problem
Items were being processed 8-11 times through `setVisibility`, causing performance issues and potential bugs.

## Root Causes Identified
1. Multiple code paths calling `#processNotificationFiltering` without checking if visibility would actually change
2. No early exit optimization when visibility state hasn't changed
3. Concurrent processing of the same item from different code paths
4. Redundant processing in:
   - Existing item updates (line ~1134)
   - Highlight checks (line ~1597)
   - Zero ETV updates (lines ~1717, ~1765)
   - Unknown ETV clearing (line ~1704)
   - Gold tier filtering (line ~554)

## Solutions Implemented

### 1. Added Early Exit in VisibilityStateManager
The `VisibilityStateManager.setVisibility()` already had an early exit check (line 143) that prevents redundant processing when visibility hasn't changed. This was already in place but wasn't preventing the redundant calls to `#processNotificationFiltering`.

### 2. Added `#wouldVisibilityChange` Helper Method
Created a new helper method that checks if an element's visibility would change based on current filters without actually applying the change:
```javascript
#wouldVisibilityChange(element) {
    if (!element) return false;
    
    const currentlyVisible = this.#isElementVisible(element);
    const shouldBeVisible = this.#calculateNodeVisibility(element);
    
    return currentlyVisible !== shouldBeVisible;
}
```

### 3. Added Processing Flag to Prevent Concurrent Updates
Added `#visibilityProcessingItems` Set to track items currently being processed for visibility updates, preventing concurrent processing of the same item.

### 4. Optimized Specific Code Paths

#### Existing Item Updates (line ~1134)
```javascript
// OPTIMIZATION: Only handle visibility change if it would actually change
if (this.#wouldVisibilityChange(element)) {
    this.#handleVisibilityChange(element, wasVisible);
}
```

#### Highlight Processing (line ~1597)
```javascript
// OPTIMIZATION: Only process filtering if visibility would change
let tileVisible = wasVisible;

if (this.#wouldVisibilityChange(notif)) {
    tileVisible = this.#processNotificationFiltering(notif);
}
```

#### Zero ETV Flag Setting (line ~1717)
```javascript
// OPTIMIZATION: Only process filtering if visibility would change
let isNowVisible = wasVisible;

if (this.#wouldVisibilityChange(notif)) {
    this.#processNotificationFiltering(notif);
    isNowVisible = this.#isElementVisible(notif);
}
```

#### Zero ETV Flag Clearing (line ~1765)
```javascript
// OPTIMIZATION: Only re-apply filtering if visibility would change
let isNowVisible = wasVisible;

if (this.#wouldVisibilityChange(notif)) {
    this.#processNotificationFiltering(notif);
    isNowVisible = this.#isElementVisible(notif);
}
```

#### Unknown ETV Processing (line ~1704)
```javascript
// OPTIMIZATION: Use centralized visibility change handling
this.#handleVisibilityChange(notif, wasVisible);
```

#### Gold Tier Filtering (line ~554)
```javascript
// OPTIMIZATION: Only re-filter if visibility would change
if (this._settings.get("notification.monitor.hideGoldNotificationsForSilverUser")) {
    if (this.#wouldVisibilityChange(notif)) {
        this.#processNotificationFiltering(notif);
    }
}
```

### 5. Early Exit in `#processNotificationFiltering`
Added early exit optimization to check if visibility would change before processing all filter logic:
```javascript
// OPTIMIZATION: Early exit if visibility wouldn't change
if (!this.#wouldVisibilityChange(node)) {
    return this.#isElementVisible(node);
}
```

### 6. Simplified `#handleVisibilityChange` for V3
For V3 with VisibilityStateManager, visibility changes are already handled by `setVisibility` in `processNotificationFiltering`, so we skip redundant processing:
```javascript
if (this._visibilityStateManager) {
    // For V3, visibility changes are already handled by setVisibility
    // No need to re-process or emit events - VisibilityStateManager handles it all
    return;
}
```

## Expected Results
- Reduced processing calls from 8-11 down to 1-2 per item
- Improved performance, especially with large numbers of items
- Eliminated redundant visibility state changes
- Prevented concurrent processing of the same item
- Maintained all existing functionality while optimizing performance

## Testing Recommendations
1. Test with debug flags enabled to verify reduced processing calls
2. Verify item counts remain accurate after filtering
3. Test all filter types (highlight, zero ETV, regular, etc.)
4. Test concurrent updates (e.g., ETV updates while filtering)
5. Verify gold tier filtering still works correctly for silver users