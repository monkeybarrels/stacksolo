# @stacksolo/core

Plugin system foundation for StackSolo. Defines interfaces for providers, resources, and patterns.

## Purpose

This package provides:
- Type definitions for the plugin architecture
- Helper functions to define providers and resources
- A registry to manage loaded plugins

## Architecture

```
src/
├── types.ts      # Core interfaces (Provider, ResourceType, etc.)
├── define.ts     # Helper functions (defineProvider, defineResource)
├── registry.ts   # Plugin registry singleton
└── index.ts      # Public exports
```

## Key Types

### Provider
Represents a cloud provider (GCP, AWS, etc.):
```typescript
interface Provider {
  id: string;              // 'gcp-cdktf'
  name: string;            // 'Google Cloud Platform'
  icon: string;            // Emoji or icon identifier
  auth: AuthMethod;        // How to authenticate
  resources: ResourceType[]; // Available resource types
}
```

### ResourceType
Defines a deployable resource:
```typescript
interface ResourceType {
  id: string;              // 'gcp-cdktf:cloud_function'
  provider: string;        // 'gcp-cdktf'
  name: string;            // 'Cloud Function'
  description: string;
  configSchema: JSONSchema; // Config validation schema
  defaultConfig: Record<string, unknown>;
  generate: (config) => GeneratedCode; // Code generator
  estimateCost?: (config) => CostEstimate;
}
```

### GeneratedCode
Output from a resource generator:
```typescript
interface GeneratedCode {
  imports: string[];  // Required imports
  code: string;       // CDKTF TypeScript code
  outputs?: string[]; // Terraform outputs to capture
}
```

## Usage

### Defining a Provider
```typescript
import { defineProvider } from '@stacksolo/core';

export default defineProvider({
  id: 'my-provider',
  name: 'My Cloud',
  icon: '☁️',
  auth: {
    type: 'cli',
    command: 'mycloud',
    instructions: 'Run: mycloud auth login',
    validate: async () => true,
  },
  resources: [myResource],
});
```

### Defining a Resource
```typescript
import { defineResource } from '@stacksolo/core';

export const storageBucket = defineResource({
  id: 'gcp-cdktf:storage_bucket',
  provider: 'gcp-cdktf',
  name: 'Storage Bucket',
  description: 'Cloud Storage bucket',
  icon: '🪣',
  configSchema: { /* JSON Schema */ },
  defaultConfig: { location: 'US' },
  generate: (config) => ({
    imports: ['import { StorageBucket } from "@cdktf/provider-google/lib/storage-bucket";'],
    code: `new StorageBucket(this, '${config.name}', { ... });`,
    outputs: ['bucketUrl'],
  }),
});
```

## Development

```bash
# Build
pnpm --filter @stacksolo/core build

# The build outputs ESM with TypeScript declarations
```

## Coding Practices

### Adding New Types
1. Add interface to `types.ts`
2. Export from `index.ts`
3. Use consistent naming: `*Config`, `*Input`, `*Type`

### Type Naming Conventions
- `*Config` - Configuration objects
- `*Type` - Type definitions for resources/providers
- `*Input` - Input for create/update operations
- `*Spec` - Specification objects

### JSON Schema
Config schemas use a simplified JSON Schema subset:
```typescript
configSchema: {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    region: { type: 'string', enum: ['us-central1', 'us-east1'] },
  },
  required: ['name'],
}
```
