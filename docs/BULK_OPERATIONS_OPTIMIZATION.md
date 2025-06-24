# Bulk Operations Optimization

## Issue Summary
The "Clear Unavail" operation was causing excessive visibility recalculations, with ~166 individual `isVisible` calls for uncached elements after removing 44 items. This was causing performance issues.

## Root Cause Analysis

### Primary Issues Identified:
1. **Redundant recalculateCount calls** - After bulk operations that already tracked visibility changes accurately, the code was calling `recalculateCount()` which cleared all caches and forced every element to recalculate visibility.

2. **Cache clearing in recalculateCount** - The `recalculateCount()` method clears all visibility caches before checking elements, forcing expensive `getComputedStyle()` calls for every element.

3. **Missing count suspension** - Bulk operations weren't using the available count suspension mechanism to prevent intermediate count updates.

## Optimizations Implemented

### 1. Removed Redundant recalculateCount After Clear Unavail
- The `bulkRemoveItems()` method already accurately tracks visible items being removed
- Removed the unnecessary `recalculateCount()` call after clearing unavailable items
- This eliminates ~166 redundant visibility checks

### 2. Added Count Suspension During Bulk Operations
- Added `suspendCountUpdates(true)` at the start of `bulkRemoveItems()`
- Added `suspendCountUpdates(false)` at the end to resume updates
- Prevents intermediate count emissions during bulk operations

### 3. Optimized Filter Operations
- The filter operation uses `batchSetVisibility()` which already tracks count changes
- Removed redundant `recalculateCount()` after filtering
- Now uses the already-updated count from VisibilityStateManager

### 4. Enhanced Debug Logging
- Added detailed logging for bulk operations (controlled by "Debug Bulk Operations" setting)
- Logs show when operations start/end and count changes
- Logs when `isVisible` is called on uncached elements with stack traces

## Performance Impact
- Eliminates ~166 visibility recalculations during "Clear Unavail"
- Reduces DOM reflows and style calculations
- Improves responsiveness of bulk operations

## Debug Settings
Enable "Debug Bulk Operations" in Settings > Debug to see detailed logs about:
- Bulk operation flow
- Count updates and suspensions
- Uncached visibility checks
- Operation timing

## Notes
- The `_verifyCount()` method still uses `recalculateCount()` but this is acceptable as it:
  - Only runs when debugging is enabled
  - Is specifically meant to fix count mismatches
  - Runs infrequently (every 30 seconds)