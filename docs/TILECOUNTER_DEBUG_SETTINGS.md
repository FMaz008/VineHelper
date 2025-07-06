# TileCounter Debug Settings Guide

Quick guide for using the TileCounter debug panel to monitor performance and troubleshoot issues.

## Enabling Debug Mode

1. Navigate to **VineHelper Settings → Debug tab**
2. Check **"Enable TileCounter Performance Monitoring"**
3. Save settings and reload the page
4. The debug panel will appear below the checkbox

## Using the Debug Panel

### Production Debugging

1. Click **"Start Monitoring"** to begin collecting data
2. Interact with the page (filter items, hide/show tiles)
3. Monitor real-time metrics:
    - **Visible Tiles**: Current visible tile count
    - **Last Recount**: Time for last recount operation
    - **Avg Delay**: Average debounce delay (target: <10ms)
    - **Cache Hit Rate**: Visibility cache effectiveness (target: >70%)
    - **Optimization**: Overall status (should show "Optimized" in green)
4. Click **"Generate Report"** for detailed analysis
5. Click **"Stop Monitoring"** when done

### Console Access

```javascript
// Access instances when debugging is enabled
window.tileCounter; // TileCounter instance
window.tileCounterDebugger; // Debugger instance

// Get performance metrics
window.tileCounter.getPerformanceMetrics();

// Force immediate recount
window.tileCounter.recountVisibleTiles(0, true);
```

## Expected Performance Metrics

| Metric               | Target              | Notes                   |
| -------------------- | ------------------- | ----------------------- |
| Avg recount time     | <10ms for 100 tiles | Batched DOM reads       |
| User action delay    | 0ms                 | Immediate response      |
| Bulk operation delay | 50ms                | Smart debouncing        |
| Cache hit rate       | >70%                | During rapid operations |

## Troubleshooting

### Common Issues

**Debug panel shows "Not monitoring"**

- Ensure you're on a Vine page with items
- Verify the debug setting is enabled
- Reload the page after enabling

**Poor performance metrics**

- Avg delay >50ms: Optimizations may not be working
- Cache hit rate <50%: Caching issues
- Check console for TileCounter errors

**Count mismatches**

- Enable additional debug options:
    - ✅ Debug Tab Title Updates
    - ✅ Debug Placeholder Calculations
    - ✅ Debug Item Processing

## Related Documentation

- [Performance Optimization Details](fixes/TILE_COUNTER_PERFORMANCE_OPTIMIZATION.md)
- [Debug Tools Overview](../scripts/notifications-monitor/debug/README.md)
