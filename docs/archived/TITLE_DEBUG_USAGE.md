# Title Display Debug Feature

## Overview

The Title Display Debug feature helps diagnose issues where product titles disappear from tiles on Amazon Vine pages. This feature provides comprehensive logging to track when titles are created, modified, and cleared by Amazon's scripts.

## Enabling Debug Logging

1. Open VineHelper settings
2. Navigate to the "Debug" tab
3. Enable "Debug Title Display" checkbox
4. Refresh the Amazon Vine page

## What Gets Logged

When enabled, the debug logger tracks:

### 1. Tile Creation

- When tiles are created
- Initial title text content
- DOM element references

### 2. Template Processing

- When templates process `{{$description}}` placeholders
- Template URLs being processed
- Processed text content

### 3. Tooltip Addition

- When tooltips are added to elements
- Tooltip text content
- Associated DOM elements

### 4. Text Modifications

- When text is cleared (with stack traces)
- When text is restored
- Mutation observer events

### 5. DOM Extraction

- Various attempts to extract title text
- Fallback mechanisms used

## Using the Debug Console

The TitleDebugLogger runs in the extension's content script context. To access it from the browser console:

### Accessing the Logger

1. Open Chrome DevTools (F12)
2. Go to the Console tab
3. Look for the context dropdown at the top of the console (usually shows "top" by default)
4. Click the dropdown and change it to the VineHelper extension context:
    - Look for "VineHelper" or the extension ID in the dropdown
    - Select the extension context
5. Now you can access the TitleDebugLogger

**Important**: The TitleDebugLogger is only available in the extension's content script context, not in the page context. You must switch to the extension context in DevTools to use it.

### View Help

```javascript
TitleDebugLogger.help();
```

### Print Summary Analysis

```javascript
TitleDebugLogger.getInstance().printSummary();
```

This shows:

- Total tiles tracked
- Number of tiles with cleared text
- Average time until text was cleared
- Common stack traces (helps identify which Amazon script is responsible)

### Export All Logs

```javascript
TitleDebugLogger.getInstance().exportLogs();
```

Returns a JSON object with:

- All logged events
- Per-ASIN logs
- Timing data
- Summary statistics

### Get Logs for Specific ASIN

```javascript
TitleDebugLogger.getInstance().getLogsForAsin("B0XXXXXXXXX");
```

### Find All Cleared Titles

```javascript
TitleDebugLogger.getInstance().findClearedTitles();
```

Returns list of ASINs where titles were cleared.

### Analyze Timing Patterns

```javascript
TitleDebugLogger.getInstance().analyzeTimings();
```

Shows a table of how long after creation each title was cleared.

## Understanding the Output

### Log Format

Each log entry includes:

- **Timestamp**: Milliseconds since page load
- **Event Type**: What happened (e.g., TILE_CREATED, TEXT_CLEARED)
- **Data**: Relevant information about the event
- **Stack Trace**: Where in the code this occurred

### Common Event Types

- `TILE_CREATED`: A new tile was initialized
- `TEMPLATE_PROCESSED`: Template engine processed the tile
- `TOOLTIP_ADDED`: Tooltip was attached to the title
- `TEXT_CLEARED`: Title text was removed
- `TEXT_RESTORED`: Title text was restored
- `MUTATION_OBSERVED`: DOM mutation detected
- `DOM_TEXT_EXTRACTED`: Text extracted from DOM

### Stack Trace Analysis

The stack traces help identify:

- Which Amazon script is clearing the text
- The exact function responsible
- The call chain leading to the text removal

## Example Workflow

1. Enable debug logging
2. Load a Vine page with items
3. Wait for titles to disappear (if the issue occurs)
4. Run `TitleDebugLogger.getInstance().printSummary()` in console
5. Look for patterns in:
    - Timing (how long after load)
    - Stack traces (which script)
    - Affected tiles (all or specific ones)

## Interpreting Results

### If All Titles Clear at Once

- Likely a global Amazon script running on a timer
- Check the stack trace for the script name
- Note the timing pattern

### If Random Titles Clear

- Could be related to specific tile attributes
- Compare affected vs unaffected tiles
- Look for patterns in the data

### If Titles Clear on Interaction

- Might be event-driven (hover, click, etc.)
- Check stack traces for event handlers
- Note what triggered the clearing

## Reporting Issues

When reporting title display issues, include:

1. Export of debug logs: `TitleDebugLogger.getInstance().exportLogs()`
2. Summary output: `TitleDebugLogger.getInstance().printSummary()`
3. Browser and OS information
4. Steps to reproduce
5. Which Amazon marketplace (US, UK, CA, etc.)

## Testing

A test page is available at `test_title_debug.html` to verify the debug logging functionality without needing to load actual Amazon pages.

## Performance Impact

The debug logging has minimal performance impact:

- Uses efficient data structures
- Limits stack trace depth
- Only active when explicitly enabled
- Automatically manages memory usage

## Security Considerations

The TitleDebugLogger is intentionally isolated in the content script context for security reasons:

- **Data Protection**: Prevents malicious websites from accessing logged product information
- **Extension Isolation**: Ensures debug data remains within the extension's secure context
- **CSP Compliance**: Works within Chrome's Content Security Policy by avoiding inline script injection

This design follows Chrome extension security best practices by maintaining strict context isolation and respecting CSP constraints.

## Next Steps

Based on the debug findings, we can:

1. Identify the specific Amazon script causing issues
2. Develop a more targeted fix
3. Potentially prevent the clearing instead of fixing it after
4. Create script-specific workarounds
