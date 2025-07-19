# VineHelper Documentation

This directory contains the core technical documentation for the VineHelper browser extension. The documentation has been consolidated into 5 comprehensive guides that cover all aspects of the project.

## Core Documentation

### 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md)
**System Architecture & Design**

Comprehensive overview of VineHelper's architecture, including:
- Project structure and core components
- Bootloader vs Notification Monitor systems
- Event-driven architecture patterns
- Multi-tab coordination (Master/Slave)
- Visibility management systems
- Memory management patterns
- Implementation guidelines
- Technical debt and future improvements

### 🔍 [KEYWORD_MATCHING.md](./KEYWORD_MATCHING.md)
**Keyword System Documentation**

Complete guide to the keyword matching system:
- **Keywords are regex patterns by default** - no special syntax needed
- Simplified architecture (2025) - local compilation only
- Proper "but without" usage with pipe separation (`pattern1|pattern2|pattern3`)
- Pattern examples: `wi[- ]?fi` matches "wifi", "wi-fi", "wi fi"
- Matching priority: highlight > hide
- Race condition fixes and proper evaluation order
- Migration from complex caching to simple compilation
- Debug features for keyword testing

### 🚀 [PERFORMANCE_AND_MEMORY.md](./PERFORMANCE_AND_MEMORY.md)
**Performance Optimization & Memory Management**

Comprehensive performance and memory documentation:
- Fixed memory leaks and their solutions
- Performance optimizations (15x keyword matching improvement)
- Stream processing architecture (95% memory reduction)
- Caching strategies and best practices
- DOM optimization techniques
- Memory debugging tools and monitoring
- Intersection Observer implementation plans
- Success metrics and benchmarks

### 🛠️ [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)
**Development Practices & Debug Tools**

Developer guide covering:
- Debug settings and their usage
- Dependency injection migration guide
- Settings manager simplification
- Development workflow and best practices
- Testing strategies
- Troubleshooting common issues
- Project status and roadmap
- Contributing guidelines

### 📚 [ARCHITECTURE.md](./ARCHITECTURE.md)
**Detailed Architecture Documentation**

In-depth technical architecture:
- Component responsibilities and boundaries
- Event flow and processing pipelines
- Performance considerations
- Architectural patterns and decisions
- System integration points
- Future architectural improvements

## Quick Reference

### Current Implementation Status
- ✅ Simplified keyword architecture (no central compilation)
- ✅ Keywords are regex patterns by default
- ✅ 15x performance improvement in keyword matching
- ✅ 95% memory reduction in stream processing
- ✅ Fixed critical memory leaks
- ✅ Proper "but without" functionality with pipe separation

### Key Concepts
1. **Keywords are regex patterns** - treated as regex by default, no special syntax needed
2. **Local compilation only** - each component compiles its own keywords
3. **Matching priority** - highlight keywords take precedence over hide keywords
4. **Performance first** - all optimizations focus on user experience

## Archived Documentation

Historical documentation has been moved to the `archived/` directory. These files contain implementation history and detailed investigations that may be useful for reference but are not part of the active documentation.

## Related Resources

- **Infrastructure Components**: See [`../scripts/infrastructure/README.md`](../scripts/infrastructure/README.md)
- **Project README**: See the root [`../README.md`](../README.md) for general project information
- **Test Documentation**: See test files for usage examples and patterns

## Documentation Standards

When updating documentation:
1. Keep content concise and focused
2. Use clear examples for complex concepts
3. Maintain consistent formatting
4. Update all affected documents when making changes
5. Include practical examples and common use cases

## Contributing

When making changes:
1. Update the relevant core documentation file
2. Ensure examples reflect current implementation
3. Test all code examples
4. Update this README if adding new documentation
5. Archive outdated documentation rather than deleting

---

*Last consolidated: January 2025 - Reduced from 23 files to 5 core documents*
