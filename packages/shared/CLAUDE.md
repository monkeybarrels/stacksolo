# @stacksolo/shared

Shared TypeScript types used across multiple StackSolo packages.

## Purpose

This is a minimal package containing types that are shared between:
- `@stacksolo/cli`
- `@stacksolo/api`
- `@stacksolo/web`

## Architecture

```
src/
└── index.ts    # All shared types
```

## Current Contents

This package is intentionally minimal. Most types live in their respective packages:
- Plugin types → `@stacksolo/core`
- Config types → `@stacksolo/blueprint`
- Registry types → `@stacksolo/registry`

## Usage

```typescript
import { SomeSharedType } from '@stacksolo/shared';
```

## Development

```bash
# Build (uses tsc)
pnpm --filter @stacksolo/shared build
```

## Coding Practices

### When to Add Types Here
Add types to this package ONLY when:
1. The type is used by 3+ packages
2. The type doesn't logically belong to another package
3. Moving it here avoids circular dependencies

### When NOT to Add Types Here
- Plugin-related types → `@stacksolo/core`
- Config schema types → `@stacksolo/blueprint`
- Database entities → `@stacksolo/registry`

### Type Naming
- Use descriptive names that indicate the domain
- Avoid generic names like `Config` or `Options`
- Prefix with domain if needed: `DeploymentConfig`, `ProjectOptions`
