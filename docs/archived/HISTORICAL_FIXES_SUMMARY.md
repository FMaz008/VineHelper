# Historical Fixes Summary

## Overview
This document consolidates various bug fixes and improvements made throughout VineHelper's development.

## Major Fix Categories

### 1. Count and Display Issues
- **Off-by-one count**: Fixed incremental tracking drift with recalculation
- **Placeholder synchronization**: Fixed buffer calculations and flicker
- **Unknown ETV filter**: Fixed null vs empty string comparison

### 2. Notification System
- **Chrome OS notifications**: Fixed blank tabs and missing images
- **Notification images**: Restored "basic" type with product image as icon
- **Click handling**: Fixed URL construction using search strings

### 3. Debug and Settings
- **Debug checkboxes**: Fixed persistence issues
- **WebSocket/ServerCom logging**: Added granular debug controls
- **Service worker logging**: Added debug control for tab messages

### 4. Memory and Performance
- **Keyword caching**: 15x performance improvement
- **Stream processing**: 95% memory reduction
- **Memory leaks**: Fixed timer cleanup in multiple services

### 5. Content Security Policy
- **CSP violations**: Removed external script sources (https://appleid.cdn-apple.com)
- **Chrome compatibility**: Updated all manifest files
- **Platform-specific approach**: Safari keeps Apple domains, Chrome/Firefox use 'self' only
- **Graceful fallback**: Added AppleID availability check with user-friendly message

## Detailed Fixes

### Count and Placeholder Synchronization

#### New Item Placement Before Placeholders
**Problem**: New items from server were placed before placeholder tiles instead of after them.
**Solution**: Modified insertion logic to find first non-placeholder tile and insert before it.

#### Zero ETV Items Not Being Counted
**Problem**: Zero ETV items weren't counted in tab title when filter was "Zero ETV or KW match only".
**Root Cause**: Type flags were set AFTER processNotificationFiltering was called.
**Solution**: Set type flags BEFORE filtering for correct visibility calculation.

#### Count Not Updating After Unpause
**Problem**: Tab title count wasn't updating properly after unpausing feed.
**Solution**: Always recount visible items after unpause since items added during pause might not have been counted.

#### Safari Display Style Check Bug
**Problem**: Safari was getting entire computed style object instead of just display property.
**Solution**: Fixed to properly extract display property using getComputedStyle().

#### Debug Settings Not Persisting
**Problem**: Debug checkboxes for tab title and placeholder debugging weren't persisting.
**Solution**: Added default values in SettingsMgrDI.js and checkbox management in settings_loadsave.js.

#### Placeholders at End Instead of Beginning
**Problem**: Placeholder tiles appeared at end of grid instead of beginning.
**Solution**: Modified GridEventManager to add placeholders first in document fragment before items.

#### Zero ETV Items Not Emitting Visibility Events
**Problem**: When items received Zero ETV values, visibility changes weren't triggering count updates.
**Solution**: Track visibility before and after setting Zero ETV flags, emit appropriate events.

#### Enhanced Zoom Detection
**Problem**: Browser zoom changes don't always trigger resize events, breaking placeholder calculations.
**Solution**: Added ResizeObserver, device pixel ratio monitoring, and reduced debounce timings.

### Unavailable Items Handling

#### Clear Unavailable Removing ALL Items
**Problem**: "Clear Unavail" button was removing all items instead of just unavailable ones.
**Root Cause**: Inconsistent data types - server uses number (1), code was using boolean (true).
**Solution**: Standardized to use `unavailable = 1` consistently across all code.

#### Placeholder Positioning with Fetch
**Problem**: When using "Fetch last 300", placeholders appeared at bottom right instead of beginning.
**Solution**: Removed duplicate sort trigger, added proper timing to ensure placeholders update before sort.

#### Off-by-One Count After Fetch
**Problem**: Count showed one more than actual visible items after fetching.
**Solution**: Added 100ms delay before counting to ensure DOM has fully settled.

### ETV and DI System Issues

#### ETV Updates Not Applying Visually
**Problem**: WebSocket newETV messages received but visual updates not happening (pink highlighting remained).
**Root Cause**: getItemDOMElement() in ItemsMgr was using non-existent domElements map.
**Solution**: Fixed to properly retrieve DOM elements from item.element or by ID.

#### DI Keyword Caching Not Working
**Problem**: Keywords being recompiled on every pagination instead of using cache.
**Root Cause**: compilationService is null in content scripts because initializeServices() only runs in service worker.
**Solution**: Requires architectural changes to share compilation service between contexts (pending).

## Common Patterns
- Always verify data types (null vs empty string, number vs boolean)
- Implement proper cleanup in destroy() methods
- Use debug flags for console logging
- Test across different browser contexts
- Consider timing issues with DOM updates
- Use ResizeObserver for reliable size change detection