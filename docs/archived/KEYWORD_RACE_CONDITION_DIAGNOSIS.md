# Keyword Matching Race Condition - Diagnosis

## Problem Summary
Items that match highlight keywords are being immediately unhighlighted due to a race condition in the `setETV` method.

## Evidence from Logs
From CONSOL-LOG-ITEM-SHOWN-THEN-REMOVED.log:
- Line 1884: `currentlyHighlighted: true, willReEvaluate: false` - Item correctly highlighted
- Line 1885: `currentlyHighlighted: false, willReEvaluate: true` - Same item loses highlight immediately (same millisecond)

## Root Cause Analysis

### The Race Condition Flow:
1. `setETV` is called for an item
2. Item matches keyword "LEGO" and gets highlighted (typeHighlight = 1)
3. Because the system has keywords with ETV conditions (`hasEtvConds = true`), the code enters the re-evaluation path
4. Re-evaluation checks if the current keyword still matches with actual ETV values
5. The match check fails, causing the highlight to be removed (typeHighlight = 0)

### Code Path:
```javascript
// Line 1684 in NotificationMonitor.js
else if (hasEtvConds && currentlyHighlighted && data.title) {
    // Re-evaluation logic that removes the highlight
}
```

### Why Re-evaluation Fails:
The re-evaluation uses `findMatch` with ETV values parsed from the DOM:
```javascript
const matchResult = findMatch(
    this.#compiledHighlightKeywords,
    data.title,
    parseFloat(etvObj.dataset.etvMin) || null,
    parseFloat(etvObj.dataset.etvMax) || null
);
```

## Hypothesis

### Primary Theory: ETV Values Not Yet Available
The most likely cause is that when re-evaluation occurs, the ETV values haven't been properly set in the DOM yet, causing:
- `etvObj.dataset.etvMin` and `etvObj.dataset.etvMax` to be undefined or null
- The `findMatch` function to return different results than the initial match
- The keyword match to be invalidated

### Secondary Theory: State Synchronization Issue
The DOM state (typeHighlight, highlightkw attributes) might not be fully synchronized when the second `setETV` call occurs, leading to incorrect state reads.

## Diagnostic Logging Added

I've added detailed logging to capture:
1. When re-evaluation conditions are met
2. The actual ETV values being used in re-evaluation
3. The match results and why highlights are being removed

## Next Steps

Please reload the extension and reproduce the issue. The new logs will show:
- `[KEYWORD-DEBUG] Re-evaluation conditions met:` - When re-evaluation is triggered
- `[KEYWORD-DEBUG] Re-evaluating highlighted item:` - The actual values being checked
- `[KEYWORD-DEBUG] Re-evaluation result:` - What the match function returns
- `[KEYWORD-DEBUG] Removing highlight:` - Why the highlight is being removed

This will confirm whether:
1. ETV values are missing/incorrect during re-evaluation
2. The match function is returning inconsistent results
3. There's a deeper issue with the keyword matching logic

## Question for Confirmation

Based on this analysis, do you agree that the issue is likely caused by the re-evaluation logic checking ETV conditions before the ETV values are properly available in the DOM? 

The logs you'll collect with the new debugging code should definitively confirm or refute this hypothesis.