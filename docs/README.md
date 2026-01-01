# StackSolo Documentation

Welcome to the StackSolo documentation. This guide will help you understand, use, and extend StackSolo.

## What is StackSolo?

StackSolo is a CLI tool that helps solo developers deploy cloud infrastructure without learning Terraform or clicking through cloud consoles. You write a simple JSON config file, and StackSolo generates real infrastructure code and deploys it for you.

**Key points:**
- Runs locally on your machine
- Generates code you own (Pulumi or CDKTF/Terraform)
- No vendor lock-in - eject anytime
- Plugin-based - add your own providers and resources

## Documentation

### Getting Started
- [Quickstart Guide](./quickstart.md) - Get up and running in 5 minutes

### User Guides
- [Configuration Guide](./configuration.md) - How to write stacksolo.config.json
- [CLI Reference](./cli-reference.md) - All CLI commands explained

### Developer Guides
- [Architecture Overview](./architecture.md) - How StackSolo works internally
- [Plugin Development](./plugin-development.md) - Create your own plugins
- [Contributing](../CONTRIBUTING.md) - How to contribute to StackSolo

### Plugin Documentation
- [GCP CDKTF Plugin](../plugins/gcp-cdktf/README.md) - Google Cloud resources
- [Kernel Plugin](../plugins/kernel/README.md) - Shared auth/files/events service

## Quick Links

| I want to... | Go to... |
|--------------|----------|
| Deploy my first app | [Quickstart](./quickstart.md) |
| See all CLI commands | [CLI Reference](./cli-reference.md) |
| Write a config file | [Configuration Guide](./configuration.md) |
| Create a plugin | [Plugin Development](./plugin-development.md) |
| Understand the architecture | [Architecture Overview](./architecture.md) |

## Getting Help

- GitHub Issues: [github.com/monkeybarrels/stacksolo/issues](https://github.com/monkeybarrels/stacksolo/issues)
- Website: [stacksolo.dev](https://stacksolo.dev)