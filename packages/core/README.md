# @stacksolo/core

Core types and registry for StackSolo infrastructure plugins.

## Installation

```bash
npm install @stacksolo/core
```

## Usage

This package provides the foundational types and registry for building StackSolo plugins.

### Types

```typescript
import type {
  Plugin,
  Provider,
  ResourceType,
  PluginService
} from '@stacksolo/core';
```

### Registry

```typescript
import { registry } from '@stacksolo/core';

// Register a provider
registry.registerProvider(myProvider);

// Register a resource type
registry.registerResource(myResource);

// Get all registered providers
const providers = registry.getProviders();

// Get a specific resource by type
const resource = registry.getResource('gcp-cdktf:cloud_function');
```

### Creating a Plugin

```typescript
import type { Plugin } from '@stacksolo/core';

const myPlugin: Plugin = {
  name: '@my-org/stacksolo-plugin-example',
  version: '1.0.0',
  providers: [myProvider],
  resources: [myResource],
  services: [myService], // Optional: runnable services
};

export default myPlugin;
```

## Types Reference

### Plugin

```typescript
interface Plugin {
  name?: string;
  version?: string;
  providers?: Provider[];
  resources?: ResourceType[];
  patterns?: AppPattern[];
  services?: PluginService[];
}
```

### PluginService

For plugins that provide runnable services (like the kernel):

```typescript
interface PluginService {
  name: string;
  image: string;           // Docker image reference
  sourcePath?: string;     // For local dev builds
  ports: Record<string, number>;
  env?: Record<string, string>;
  resources?: {
    cpu?: string;
    memory?: string;
  };
}
```

## License

MIT
