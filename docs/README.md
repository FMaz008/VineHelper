# VineHelper Documentation

This directory contains architectural and technical documentation for the VineHelper project.

## Documents

### [ARCHITECTURE.md](./ARCHITECTURE.md)

Comprehensive overview of the VineHelper architecture, including:

- Current architecture analysis
- Identified issues and technical debt
- Refactoring recommendations and priorities
- Implementation status tracking

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

## Related Documentation

- **Infrastructure Components**: See [`../scripts/infrastructure/README.md`](../scripts/infrastructure/README.md) for detailed documentation on the DI container and storage adapters
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
