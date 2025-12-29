# Contributing to StackSolo

Thank you for your interest in contributing to StackSolo! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/monkeybarrels/stacksolo/issues)
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the behavior
   - Expected vs actual behavior
   - Your environment (OS, Node version, etc.)
   - Relevant logs or error messages

### Suggesting Features

1. Check existing issues and discussions for similar suggestions
2. Create a new issue with the `enhancement` label
3. Describe the feature and its use case
4. Explain why it would benefit StackSolo users

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Run linting (`pnpm lint`)
6. Commit your changes with a clear message
7. Push to your fork
8. Open a Pull Request

#### PR Guidelines

- Keep PRs focused on a single change
- Update documentation if needed
- Add tests for new functionality
- Follow existing code style
- Reference related issues in the PR description

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/stacksolo.git
cd stacksolo

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Project Structure

```
stacksolo/
├── packages/
│   ├── cli/        # Main CLI entry point
│   ├── core/       # Plugin system and types
│   ├── blueprint/  # Config parsing and resolution
│   └── registry/   # Project/resource tracking
├── plugins/
│   └── gcp/        # GCP provider and resources
└── _docs/          # Internal documentation
```

## Adding New GCP Resources

1. Create a new file in `plugins/gcp/src/resources/`
2. Use `defineResource()` to define the resource
3. Implement `generatePulumi()` to generate Pulumi code
4. Export from `plugins/gcp/src/resources/index.ts`
5. Add to the provider in `plugins/gcp/src/provider.ts`

## Questions?

Feel free to open a Discussion or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
