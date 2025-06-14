# VineHelper Architecture Overview

## Project Structure

VineHelper is a browser extension that enhances the Amazon Vine experience. The codebase reveals several architectural patterns and areas for improvement.

## Current Architecture

### Core Components

1. **Bootloader System** (`scripts/bootloader.js`)

    - Initializes all singleton instances
    - Sets up the environment and dependencies
    - Creates grid instances and manages tabs
    - Heavy coupling with global state

2. **Notification Monitor** (`scripts/notification_monitor/`)

    - Complex subsystem with multiple components
    - Master/Slave architecture for multi-tab coordination
    - Stream-based processing for new items
    - Version-specific implementations (V2, V3)

3. **Settings Management** (`scripts/SettingsMgr.js`)

    - Singleton pattern
    - Chrome storage integration
    - No dependency injection

4. **UI Components**
    - **Grid System**: Manages product tiles across different tabs
    - **Tile System**: Individual product representation
    - **Toolbar**: Product-specific actions
    - **Modal Management**: Dynamic modal creation

### Architectural Patterns

1. **Singleton Pattern (Overused)**

    - Almost every major component is a singleton
    - Makes testing difficult
    - Creates tight coupling

2. **Event-Driven Architecture**

    - Hook system for extensibility
    - Browser message passing
    - DOM event handling

3. **Stream Processing**
    - `Streamy.js` provides functional stream processing
    - Used in notification processing pipeline

## Areas for Improvement

### 1. Separation of Concerns

**Current Issues:**

- Monster classes with multiple responsibilities
- Business logic mixed with UI logic
- Data access spread throughout components

**Recommendations:**

- Extract business logic into service classes
- Implement repository pattern for data access
- Create dedicated UI controllers

### 2. Dependency Injection

**Current Issues:**

- Hard-coded singleton dependencies
- Difficult to mock for testing
- Tight coupling between components

**Recommendations:**

- Implement a DI container
- Use constructor injection
- Create interfaces for major components

### 3. Folder Structure Reorganization

**Current Structure:**

```
scripts/
├── notification_monitor/  # Subsystem
├── chart.js/             # External library
└── [40+ files]           # Mixed concerns
```

**Proposed Structure:**

```
scripts/
├── core/
│   ├── services/         # Business logic
│   ├── repositories/     # Data access
│   ├── models/          # Domain models
│   └── utils/           # Helpers
├── ui/
│   ├── components/      # UI components
│   ├── controllers/     # UI logic
│   └── templates/       # View templates
├── notification-monitor/
│   ├── core/           # Monitor business logic
│   ├── stream/         # Stream processing
│   └── coordination/   # Master/Slave logic
├── infrastructure/
│   ├── storage/        # Storage adapters
│   ├── messaging/      # Message bus
│   └── injection/      # DI container
└── vendor/             # Third-party libs
```

### 4. Testability Improvements

**Ready for Testing:**

- `Streamy.js` - Pure functional stream processing
- `keywordMatch.js` - Pure function with clear inputs/outputs

**Close to Testable:**

- `NotificationsSoundPlayer.js` - Needs Settings injection
- `NewItemStreamProcessing.js` - Needs Settings/output injection
- `MasterSlave.js` - Needs monitor injection

**Testing Strategy:**

1. Start with pure functions and utilities
2. Refactor classes to accept dependencies
3. Create test doubles for Chrome APIs
4. Implement integration tests for critical paths

## Recommended Refactoring Approach

### Phase 1: Foundation (Start Here)

1. **Create DI Container**

    - Simple factory pattern initially
    - Register core services
    - Gradually migrate from singletons

2. **Extract Pure Business Logic**
    - Start with `keywordMatch` functionality
    - Create service interfaces
    - Move logic out of UI components

### Phase 2: Restructure

1. **Reorganize Folder Structure**

    - Create new structure alongside old
    - Gradually migrate files
    - Update imports incrementally

2. **Refactor Notification Monitor**
    - Extract stream processing logic
    - Separate coordination from business logic
    - Create testable components

### Phase 3: Testing

1. **Unit Tests**

    - Start with pure functions
    - Add tests for refactored services
    - Mock external dependencies

2. **Integration Tests**
    - Test critical user flows
    - Mock Chrome APIs
    - Test multi-tab coordination

## Priority Recommendations

Based on the developer's wishlist and codebase analysis:

1. **Start with Dependency Injection** (Highest Impact)

    - Enables all other improvements
    - Start small with Settings/Logger
    - Gradually expand to other services

2. **Refactor Streamy.js Testing**

    - Already close to testable
    - Good learning example
    - Demonstrates testing approach

3. **Extract Notification Processing Logic**

    - High complexity area
    - Would benefit most from refactoring
    - Critical to application functionality

4. **Reorganize Folder Structure**
    - Do incrementally alongside other work
    - Start with new code
    - Migrate during refactoring

## Technical Debt Priorities

1. **Bootloader Refactoring** - High risk, high reward
2. **Singleton Elimination** - Medium risk, high reward
3. **Monster Class Breakdown** - Low risk, medium reward
4. **Folder Reorganization** - Low risk, low reward

## Next Steps

1. ~~Create a simple DI container~~ ✓ Completed
2. ~~Refactor SettingsMgr to use DI~~ ✓ Completed
3. Write tests for Streamy.js
4. Extract keyword matching into a service
5. ~~Document patterns for team adoption~~ ✓ Completed (see DEPENDENCY_INJECTION_MIGRATION.md)

## Implementation Status

### Completed (Phase 1)

- Created DIContainer with singleton/transient support
- Implemented StorageAdapter abstraction (Chrome and Memory implementations)
- Refactored SettingsMgr to use dependency injection
- Created compatibility layer for gradual migration
- Added comprehensive unit tests for DI components
- Updated bootloader.js to demonstrate the pattern
- Created migration documentation

### In Progress

- Monitoring the implementation in production
- Gathering feedback on the DI approach

### Next Priority

- Refactor Logger to use DI
- Create adapters for other browser APIs
- Update HiddenListMgr and PinnedListMgr
