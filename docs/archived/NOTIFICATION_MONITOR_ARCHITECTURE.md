# VineHelper Notification Monitor Architecture

## Overview

The Notification Monitor is a real-time item tracking system that displays Amazon Vine items as they become available. It uses a master/slave architecture to coordinate between multiple browser tabs and efficiently manage resources.

## Architecture Components

### 1. Master/Slave Coordination

- **MasterSlave.js**: Manages which monitor instance acts as master
- Only the master fetches items from the server
- Slave monitors receive items via BroadcastChannel
- Automatic failover if master tab closes

### 2. Core Components

#### MonitorCore.js

- Base class for all monitor types
- Initializes core services (settings, hooks, etc.)
- Manages master/slave state transitions
- Creates WebSocket and AutoLoad instances for master

#### NotificationMonitor.js

- Main monitor implementation
- Handles item display and filtering
- Manages UI interactions
- Processes incoming items

#### NotificationMonitorV3.js

- Enhanced version with dependency injection
- Uses DIContainer for service management
- Implements advanced features like NoShiftGrid

#### NotificationMonitorV2.js

- Lightweight slave-only version
- Receives items via broadcast channel
- Used for secondary monitor instances

### 3. Data Flow

```
WebSocket Server
    ↓
Master Monitor (V3)
    ├─→ WebSocket.js (receives items)
    ├─→ ServerCom.js (processes items)
    ├─→ Stream Processing
    └─→ BroadcastChannel
            ↓
    Slave Monitors (V2)
```

### 4. Visibility Management

#### VisibilityStateManager

Centralized service managing both:

- **Element Visibility**: Tracks which items are visible/hidden
- **Count Management**: Maintains accurate count of visible items
- **Performance**: WeakMap caching, batch operations
- **Events**: Emits visibility changes for UI updates

Key features:

- `setVisibility()`: Update element visibility with automatic count tracking
- `isVisible()`: Check visibility with caching
- `batchSetVisibility()`: Batch operations for performance
- `recalculateCount()`: Full recount from DOM
- `handlePossibleVisibilityChange()`: Track visibility changes

### 5. Item Fetching

#### WebSocket Connection

- Connects to VineHelper API
- Receives real-time item updates
- Handles reconnection automatically

#### AutoLoad

- Manages automatic page reloading
- Respects time windows and intervals
- Handles special cases (captcha, login, etc.)

#### Initial Load

- Master monitor automatically fetches last 100 items on startup
- Includes retry logic for connection delays
- Manual refresh available via "Last 100" button

### 6. Grid Management

#### NoShiftGrid

- Maintains visual stability during filtering
- Uses placeholders to prevent layout shifts
- Calculates grid dimensions dynamically
- Handles responsive layouts

### 7. Performance Optimizations

1. **Batch Operations**: Reduces DOM reflows from O(n) to O(1)
2. **WeakMap Caching**: Prevents memory leaks, caches computed styles
3. **Event Debouncing**: Batches rapid UI updates
4. **Lazy Loading**: Only processes visible items
5. **Stream Processing**: Handles large item batches efficiently

## Initialization Flow

1. **Page Load**
    - NotificationMonitorV3 instantiated
    - Settings loaded and keywords precompiled
    - UI template loaded and rendered

2. **Master/Slave Determination**
    - MasterSlave checks for existing master
    - If none found, becomes master
    - Otherwise, becomes slave

3. **Master Setup**
    - Creates WebSocket connection
    - Initializes AutoLoad timer
    - Fetches initial items automatically

4. **Item Processing**
    - Items received via WebSocket
    - Processed through ServerCom
    - Filtered and displayed in grid
    - Broadcast to slave monitors

## Error Handling

- **Connection Failures**: Automatic reconnection with exponential backoff
- **DOM Errors**: Null checks prevent crashes
- **Memory Management**: Proper cleanup on destroy
- **State Consistency**: Centralized visibility tracking

## Future Improvements

1. **Progressive Enhancement**: Gradual migration to full DI
2. **Performance Monitoring**: Built-in metrics collection
3. **Enhanced Filtering**: More sophisticated item matching
4. **Offline Support**: Cache and queue management
