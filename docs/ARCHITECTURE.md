# VineHelper Architecture Documentation

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [System Boundaries](#system-boundaries)
5. [Architectural Patterns](#architectural-patterns)
6. [Notification Monitor Architecture](#notification-monitor-architecture)
7. [Event Flow and Processing](#event-flow-and-processing)
8. [Memory Management](#memory-management)
9. [Performance Architecture](#performance-architecture)
10. [Dependency Injection Migration](#dependency-injection-migration)
11. [Implementation Guidelines](#implementation-guidelines)
12. [Technical Debt](#technical-debt)
13. [Future Improvements](#future-improvements)

## Overview

VineHelper is a browser extension that enhances the Amazon Vine experience through two distinct operational modes:

1. **Page Enhancement Mode** - Enhances existing Amazon Vine pages
2. **Custom Interface Mode** - Provides a real-time notification monitor

## Project Structure

```
VineHelper/
├── scripts/
│   ├── bootloader.js              # Initializes page enhancements
│   ├── core/                      # Core utilities and services
│   │   ├── models/               # Data models
│   │   ├── services/             # Business logic services
│   │   └── utils/                # Utility functions
│   ├── infrastructure/           # DI container and adapters
│   ├── notifications-monitor/    # Custom notification system
│   │   ├── coordination/         # Multi-tab coordination
│   │   ├── core/                # Monitor implementations
│   │   ├── services/            # Monitor-specific services
│   │   └── stream/              # WebSocket and streaming
│   └── ui/                      # UI components
│       ├── components/          # Reusable components
│       ├── controllers/         # UI controllers
│       └── templates/           # HTML templates
├── tests/                       # Test files
└── docs/                        # Documentation
```

## Core Components

### 1. Bootloader System (`scripts/bootloader.js`)

- Initializes singleton instances
- Sets up environment and dependencies
- Creates grid instances and manages tabs
- **Enhances Amazon Vine pages** with:
    - Tile and Toolbar components
    - Order status tracking
    - Hidden/Pinned item management
    - Direct DOM manipulation

### 2. Notification Monitor (`scripts/notifications-monitor/`)

- Complex subsystem with multiple components
- Master/Slave architecture for multi-tab coordination
- Stream-based processing for new items
- **Separate from bootloader** - creates its own:
    - Custom tile rendering system
    - Independent grid management
    - Complete UI replacement

### 3. Settings Management (`scripts/core/services/SettingsMgrDI.js`)

- Dependency injection pattern with StorageAdapter
- Array caching for stable references
- Simple data storage (no compilation)
- Migration system for version updates

### 4. UI Components

- **Grid System**: Manages product tiles
- **Tile System**: Individual product representation
    - Bootloader tiles: Enhance existing Amazon tiles
    - Monitor tiles: Custom-built from scratch
- **Toolbar**: Product-specific actions (bootloader only)
- **Modal Management**: Dynamic modal creation

## System Boundaries

### Page Enhancement Mode (Bootloader)

- **Runs on**: Amazon Vine pages (RFY, AFA, AI)
- **Purpose**: Enhance existing UI
- **Features**:
    - Adds toolbars with order tracking
    - Implements pinning and hiding
    - Preserves Amazon's tile structure
    - Minimal performance impact

### Custom Interface Mode (Notification Monitor)

- **Runs on**: Separate VineHelper page
- **Purpose**: Real-time monitoring
- **Features**:
    - Complete custom UI
    - WebSocket connections
    - Multi-tab coordination
    - Stream processing

## Architectural Patterns

### 1. Event-Driven Architecture

- Hook system for extensibility
- Browser message passing
- DOM event handling
- Event batching for performance

### 2. Stream Processing

- `Streamy.js` provides functional stream processing
- Used in notification processing pipeline
- Efficient handling of large data volumes

### 3. Master-Slave Coordination

- One tab acts as master for server communication
- Other tabs receive data via BroadcastChannel
- Automatic failover if master crashes
- Prevents duplicate server requests

### 4. Singleton Pattern (Being Phased Out)

- Currently overused in legacy code
- Migration to dependency injection in progress
- Makes testing difficult
- Creates tight coupling

## Notification Monitor Architecture

### Multi-Tab Coordination

```
┌─────────────┐     BroadcastChannel      ┌─────────────┐
│ Master Tab  │ ◄─────────────────────────► │ Slave Tab 1 │
│             │                             └─────────────┘
│ - WebSocket │     BroadcastChannel      ┌─────────────┐
│ - ServerCom │ ◄─────────────────────────► │ Slave Tab 2 │
│ - AutoLoad  │                             └─────────────┘
└─────────────┘
      │
      ▼
 WebSocket Server
```

### Core Components

#### MonitorCore.js

- Base class for all monitor types
- Initializes core services
- Manages master/slave transitions
- Creates WebSocket instances for master

#### NotificationMonitor.js

- Main monitor implementation
- Handles item display and filtering
- Manages UI interactions
- Processes incoming items

#### NotificationMonitorV3.js

- Enhanced version with dependency injection
- Uses DIContainer for service management
- Implements advanced features like NoShiftGrid

### Data Flow

```
WebSocket Server
    ↓
Master Monitor
    ├─→ WebSocket.js (receives items)
    ├─→ ServerCom.js (processes items)
    ├─→ Stream Processing (filters/transforms)
    └─→ BroadcastChannel
            ↓
    Slave Monitors (display only)
```

## Event Flow and Processing

### Filter Change Flow

```
User Action → NotificationMonitor → Debounced Handler → Atomic Update → Single DOM Update
```

### Item Processing Flow

```
WebSocket Message → Stream Processing → Keyword Matching → UI Update → Sound Notification
```

### Visibility Management

- **VisibilityStateManager**: Centralized visibility tracking
- **TileCounter**: Optimized counting with caching
- **Event batching**: Prevents UI thrashing
- **Performance**: O(1) visibility checks with WeakMap

## Memory Management

### Fixed Issues

1. **Uncleared Intervals**: Added proper cleanup in destroy() methods
2. **Instance Leaks**: NotificationMonitor cleanup in bootloader
3. **KeywordMatch Retention**: WeakMap + counter caching approach
4. **Socket.io Leaks**: Proper cleanup before reconnection

### Best Practices

1. **Cleanup Lifecycle**: Every class implements destroy()
2. **WeakMap Usage**: For DOM element associations
3. **Event Management**: Store and remove all listeners
4. **Reference Clearing**: Null out data when removing elements

### Memory Monitoring

- Enable via Settings > Debug > Memory Analysis
- Available as `VH_MEMORY` in console
- Automatic snapshots and leak detection

## Performance Architecture

### Stream Processing Evolution

- **Before**: Separate handlers, 9.4MB memory, 15ms per item
- **After**: Unified handler, 300KB memory, 1ms per item
- **Key**: Consolidated processing, shared caching

### Keyword Matching Optimization

- **Problem**: Settings.get() returns new array references
- **Solution**: WeakMap + counter approach for cache keys
- **Result**: 15x performance improvement, 99%+ cache hits

### DOM Optimization

- **Batch Operations**: Reduce reflows from O(n) to O(1)
- **Visibility Caching**: WeakMap for computed styles
- **Event Debouncing**: Smart delays based on operation type
- **Virtual Scrolling**: Planned for large datasets

## Dependency Injection Migration

### Current Status

✅ **Completed**

- DIContainer with singleton/transient support
- StorageAdapter abstraction
- SettingsMgrDI refactored
- Compatibility layer for gradual migration

🔧 **In Progress**

- Logger service migration
- Browser API adapters

📋 **Planned**

- List managers (Hidden, Pinned)
- Business logic extraction
- Notification monitor refactoring

### Migration Pattern

```javascript
// Old (Singleton)
import { SettingsMgr } from "./SettingsMgr.js";
const settings = new SettingsMgr();

// New (DI)
import { DIContainer } from "./infrastructure/DIContainer.js";
const settings = container.resolve("settingsManager");
```

## Implementation Guidelines

### Critical Guidelines

1. **Visibility State Changes**
    - Track state before and after operations
    - Emit appropriate grid events
    - Update VisibilityStateManager count

2. **Event Batching**
    - Placeholder updates: 50ms delay
    - Tab title updates: 100ms delay
    - Prevents UI thrashing

3. **Browser Compatibility**
    - Safari: Use window.getComputedStyle()
    - Others: Use element.style.display
    - Always check browser type

4. **Testing Strategy**
    - Verify behavior, not implementation
    - Include edge cases
    - Ensure maintainability

## Technical Debt

### High Priority

1. **Bootloader Refactoring** - Complex initialization logic
2. **Singleton Elimination** - Improve testability
3. **Event System** - Implement proper unbinding

### Medium Priority

1. **Monster Classes** - Break down large components
2. **Code Organization** - Better folder structure
3. **Type Safety** - Add TypeScript definitions

### Low Priority

1. **Documentation** - Inline code documentation
2. **Test Coverage** - Increase unit test coverage
3. **Build System** - Modernize build pipeline

## Future Improvements

### Performance

1. **Virtual Scrolling** - Handle 1000+ items efficiently
2. **Web Workers** - Offload processing
3. **IndexedDB** - Better data persistence

### Architecture

1. **Microservices** - Split into smaller services
2. **Event Sourcing** - Better state management
3. **Plugin System** - User extensibility

### User Experience

1. **Progressive Enhancement** - Faster initial load
2. **Offline Support** - Work without connection
3. **Mobile Support** - Responsive design

## Conclusion

VineHelper's architecture balances complexity with performance, providing both page enhancement and custom monitoring capabilities. The ongoing migration to dependency injection and performance optimizations ensure the extension remains maintainable and efficient as it grows.

Key architectural decisions:

- Separation of enhancement vs monitoring systems
- Event-driven design for extensibility
- Performance-first approach to optimization
- Gradual migration strategy for improvements

The architecture continues to evolve based on user needs and technical requirements, with a focus on maintainability, performance, and user experience.
