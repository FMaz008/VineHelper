# VineHelper Documentation

This directory contains architectural and technical documentation for the VineHelper project.

## Documents

### [ARCHITECTURE.md](./ARCHITECTURE.md)

Comprehensive overview of the VineHelper architecture, including:

- Current architecture analysis
- Identified issues and technical debt
- Refactoring recommendations and priorities
- Implementation status tracking
- Event-driven architecture patterns
- Visibility state management guidelines
- Safari compatibility requirements
- **Memory leak prevention patterns and guidelines**

### [DEPENDENCY_INJECTION_MIGRATION.md](./DEPENDENCY_INJECTION_MIGRATION.md)

Step-by-step guide for migrating from singleton pattern to dependency injection:

- Migration strategies (quick, full, custom)
- Code examples and patterns
- Testing approaches
- Troubleshooting guide

### [DI_IMPLEMENTATION_ROADMAP.md](./DI_IMPLEMENTATION_ROADMAP.md)

Detailed roadmap for completing the DI refactoring:

- Phase-by-phase implementation plan
- Specific PRs and tasks
- Code examples for each phase
- Success metrics and review checklist

### [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md)

Consolidated tracking of planned improvements and optimizations:

- Performance optimizations (visibility caching, event batching)
- Architectural improvements (DI completion, refactoring plans)
- Code quality improvements and technical debt
- Feature enhancements and implementation priorities

### [KEYWORD_PRECOMPILATION.md](./KEYWORD_PRECOMPILATION.md)

Implementation details for keyword optimization system:

- Regex pre-compilation for performance
- Settings array caching to prevent memory allocations
- WeakMap caching strategy
- Performance improvements and testing
- Automatic pre-compilation on first use
- Manual pre-compilation for startup optimization
- Architecture decisions and rationale
- Testing strategies and code examples

### [KEYWORD_OPTIMIZATION_AND_DI.md](./KEYWORD_OPTIMIZATION_AND_DI.md)

Comprehensive guide to keyword optimization and DI implementation:

- Keyword regex pre-compilation and caching
- Dependency Injection architecture for cross-context sharing
- Bug fixes for notification count and ETV handling
- Performance improvements and code quality enhancements
- Migration guide and architecture diagrams

### [DI_KEYWORD_COMPILATION_MIGRATION.md](./DI_KEYWORD_COMPILATION_MIGRATION.md)

Migration guide for DI-based keyword compilation:

- Architecture overview with cross-context sharing
- Step-by-step migration instructions
- Service descriptions and API documentation
- Testing strategies and examples

### [DI_KEYWORD_COMPILATION_SUMMARY.md](./DI_KEYWORD_COMPILATION_SUMMARY.md)

Summary of DI keyword compilation implementation:

- Overview of implemented services
- KeywordCompilationService details
- RuntimeAdapter and infrastructure updates
- Documentation and test coverage

## Related Documentation

- **Infrastructure Components**: See [`../scripts/infrastructure/README.md`](../scripts/infrastructure/README.md) for detailed documentation on the DI container and storage adapters
- **Memory Debugging**: See [`../scripts/notifications-monitor/debug/README.md`](../scripts/notifications-monitor/debug/README.md) for memory debugger usage
- **Project README**: See the root [`../README.md`](../README.md) for general project information and setup instructions

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
