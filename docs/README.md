# VineHelper Documentation

This directory contains architectural and technical documentation for the VineHelper project.

## Core Documentation

### [ARCHITECTURE.md](./ARCHITECTURE.md)

Comprehensive overview of the VineHelper architecture, including:

- Current architecture analysis
- System boundaries and operational modes
- Notification Monitor architecture details
- Memory management best practices and fixed issues
- Dependency injection migration status
- Implementation guidelines and patterns
- Technical debt priorities
- Future improvements roadmap

### [CHANGES_AND_FIXES.md](./CHANGES_AND_FIXES.md)

Consolidated summary of all changes, fixes, and improvements:

- Recent bug fixes and enhancements
- Feature branch fixes (Fix #1-7)
- Keyword system improvements
- Memory management optimizations
- Architecture improvements
- Test coverage status
- Performance metrics

### [MEMORY_MANAGEMENT.md](./MEMORY_MANAGEMENT.md)

Comprehensive memory management documentation:

- Fixed memory issues and their solutions
- Current best practices and patterns
- Memory debugging tools and usage
- Performance monitoring guidelines
- Prevention strategies

### [DEPENDENCY_INJECTION_MIGRATION.md](./DEPENDENCY_INJECTION_MIGRATION.md)

Step-by-step guide for migrating from singleton pattern to dependency injection:

- Migration strategies (quick, full, custom)
- Code examples and patterns
- Testing approaches
- Troubleshooting guide

### [DEBUG_SETTINGS_USAGE.md](./DEBUG_SETTINGS_USAGE.md)

Comprehensive guide to all debug settings:

- Complete list of debug settings and their purposes
- Usage examples and code snippets
- Settings configuration and initialization
- Periodic count verification feature

### [DEBUG_SETTINGS_MAPPING.md](./DEBUG_SETTINGS_MAPPING.md)

Comprehensive mapping of debug settings throughout the codebase:

- How debug flags flow from UI to console logging
- Which files use each debug flag
- Console logging patterns and best practices
- Recommendations for debug flag usage

### [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md)

Practical troubleshooting guide for common issues:

- Quick debug flag reference table
- Step-by-step debugging procedures
- Common issues and solutions
- Where to find debug output
- Known limitations and workarounds

### [NOTIFICATION_SYSTEM_CURRENT_STATE.md](./NOTIFICATION_SYSTEM_CURRENT_STATE.md)

Current state of the notification system:

- System overview and architecture
- Implementation status of all fixes
- Performance metrics and improvements
- Future improvement opportunities

### [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)

Tracking of planned improvements and optimizations:

- Performance optimizations
- Architectural improvements
- Code quality improvements
- Implementation priorities

## Archived Documentation

Older documentation files have been moved to the `archived/` directory. These contain historical context and detailed implementation notes that may be useful for reference but are not part of the active documentation set.

## Related Documentation

- **Infrastructure Components**: See [`../scripts/infrastructure/README.md`](../scripts/infrastructure/README.md) for DI container and storage adapters
- **Project README**: See the root [`../README.md`](../README.md) for general project information

## Documentation Standards

When adding new documentation:

1. Use clear, descriptive filenames
2. Include a table of contents for longer documents
3. Provide code examples where applicable
4. Keep documentation up-to-date with implementation changes
5. Cross-reference related documents

## Contributing

When making architectural changes or adding new patterns:

1. Update the relevant documentation
2. Add examples to migration guides
3. Update the implementation status in ARCHITECTURE.md
4. Ensure all code examples are tested and working
