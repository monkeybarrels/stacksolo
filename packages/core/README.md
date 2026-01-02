# @stacksolo/core

The core types and registry for StackSolo plugins. This package defines how plugins work and provides a central place to register them.

## What is this package?

This is the foundation that all StackSolo plugins build on. It provides:

1. **TypeScript types** - Interfaces that define what a plugin looks like
2. **Plugin registry** - A central place where all plugins register themselves
3. **Helper functions** - Utilities for working with plugins

If you're **using** StackSolo to deploy apps, you probably don't need to use this package directly. It's mainly for people **building** plugins.

---

## Installation

```bash
npm install @stacksolo/core
```

---

## Who should use this package?

### Plugin Authors

If you're building a StackSolo plugin (like adding support for AWS, Azure, or a new service), you'll use this package to:
- Define your resources using the correct types
- Register your plugin with StackSolo

### Core Contributors

If you're working on StackSolo itself, you'll use this package to:
- Look up registered plugins
- Access resource type definitions
- Work with the plugin system

---

## Basic Concepts

### What is a Plugin?

A plugin adds new capabilities to StackSolo. For example:
- The `gcp-cdktf` plugin adds Google Cloud resources (Functions, Storage, etc.)
- The `kernel` plugin adds a shared auth/files/events service

Each plugin can provide:
- **Providers** - Cloud platforms (GCP, AWS, Azure)
- **Resources** - Things you can create (functions, databases, buckets)
- **Services** - Runnable services (like the kernel)

### What is a Resource?

A resource is something StackSolo can create for you. Examples:
- A Cloud Function
- A Storage Bucket
- A Load Balancer

Each resource type knows how to generate the infrastructure code needed to create it.

---

## Usage

### Importing Types

```typescript
import type {
  Plugin,           // A StackSolo plugin
  Provider,         // A cloud provider (GCP, AWS, etc.)
  ResourceType,     // A type of resource (function, bucket, etc.)
  PluginService,    // A runnable service
} from '@stacksolo/core';
```

### Using the Registry

The registry keeps track of all registered plugins, providers, and resources:

```typescript
import { registry } from '@stacksolo/core';

// Get all registered providers
const providers = registry.getProviders();
console.log('Available providers:', providers.map(p => p.name));

// Get a specific resource type
const functionResource = registry.getResource('gcp-cdktf:cloud_function');
if (functionResource) {
  console.log('Found resource:', functionResource.name);
}

// Register a new provider (plugins do this automatically)
registry.registerProvider(myProvider);

// Register a new resource type
registry.registerResource(myResource);
```

---

## Creating a Plugin

Here's how to create a simple StackSolo plugin:

### Step 1: Define your plugin

```typescript
import type { Plugin, ResourceType } from '@stacksolo/core';

// Define a resource type
const myBucketResource: ResourceType = {
  id: 'my-plugin:bucket',
  name: 'My Bucket',
  description: 'A storage bucket',
  provider: 'my-plugin',

  // JSON Schema for configuration
  configSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      location: { type: 'string', default: 'US' },
    },
    required: ['name'],
  },

  // Function that generates infrastructure code
  generate: (config) => {
    return {
      imports: ['import { Bucket } from "./bucket"'],
      code: `new Bucket("${config.name}", { location: "${config.location}" })`,
      outputs: ['bucketName'],
    };
  },
};

// Create the plugin
const myPlugin: Plugin = {
  name: '@my-org/stacksolo-plugin-example',
  version: '1.0.0',
  resources: [myBucketResource],
};

export default myPlugin;
```

### Step 2: Register your plugin

Plugins are typically auto-discovered by StackSolo, but you can also register manually:

```typescript
import { registry } from '@stacksolo/core';
import myPlugin from './my-plugin';

// Register all resources from the plugin
for (const resource of myPlugin.resources || []) {
  registry.registerResource(resource);
}
```

---

## Types Reference

### Plugin

The main plugin interface. A plugin is a package that extends StackSolo's capabilities.

```typescript
interface Plugin {
  name?: string;           // Package name (e.g., '@stacksolo/plugin-gcp-cdktf')
  version?: string;        // Semantic version (e.g., '1.0.0')
  providers?: Provider[];  // Cloud providers this plugin supports
  resources?: ResourceType[];  // Resource types this plugin provides
  patterns?: AppPattern[]; // Pre-built application patterns
  services?: PluginService[];  // Runnable services (like the kernel)
}
```

### Provider

A cloud platform that can host resources.

```typescript
interface Provider {
  id: string;              // Unique identifier (e.g., 'gcp-cdktf')
  name: string;            // Display name (e.g., 'Google Cloud Platform')
  description?: string;    // What this provider does
  auth?: AuthConfig;       // How to authenticate
}
```

### ResourceType

A type of cloud resource that can be created.

```typescript
interface ResourceType {
  id: string;              // Unique identifier (e.g., 'gcp-cdktf:cloud_function')
  name: string;            // Display name (e.g., 'Cloud Function')
  description?: string;    // What this resource does
  provider: string;        // Which provider this belongs to
  configSchema: object;    // JSON Schema for configuration
  generate: (config) => GeneratedCode;  // Code generation function
}
```

### PluginService

A service that can be run (like the kernel).

```typescript
interface PluginService {
  name: string;            // Service name (e.g., 'kernel')
  image: string;           // Docker image (e.g., 'ghcr.io/org/kernel:1.0.0')
  sourcePath?: string;     // Path to source code (for local dev builds)
  ports: Record<string, number>;  // Exposed ports (e.g., { http: 8080 })
  env?: Record<string, string>;   // Environment variables
  resources?: {
    cpu?: string;          // CPU allocation (e.g., '1')
    memory?: string;       // Memory allocation (e.g., '512Mi')
  };
}
```

### GeneratedCode

What a resource's `generate` function returns.

```typescript
interface GeneratedCode {
  imports: string[];       // Import statements needed
  code: string;            // The infrastructure code
  outputs?: string[];      // Output values (like URLs, IDs)
}
```

---

## Naming Conventions

### Resource IDs

Resource IDs follow the pattern `provider:resource_name`:

```
gcp-cdktf:cloud_function    # A Cloud Function on GCP
gcp-cdktf:storage_bucket    # A Storage Bucket on GCP
kernel:service              # The Kernel service
```

### Plugin Package Names

Plugins should be named following one of these patterns:

```
@stacksolo/plugin-{name}    # Official plugins
@my-org/stacksolo-plugin-{name}  # Org-scoped plugins
stacksolo-plugin-{name}     # Community plugins
```

---

## Example: Looking Up a Resource

Here's a complete example of using the registry to find and use a resource:

```typescript
import { registry } from '@stacksolo/core';

// Get the Cloud Function resource type
const functionResource = registry.getResource('gcp-cdktf:cloud_function');

if (!functionResource) {
  console.error('Cloud Function resource not found. Is the GCP plugin installed?');
  process.exit(1);
}

// Generate code for a function
const config = {
  name: 'my-api',
  runtime: 'nodejs20',
  entryPoint: 'api',
  memory: '256Mi',
};

const generated = functionResource.generate(config);

console.log('Imports:', generated.imports);
console.log('Code:', generated.code);
console.log('Outputs:', generated.outputs);
```

---

## Related Packages

- **@stacksolo/cli** - The command-line tool that uses these types
- **@stacksolo/plugin-gcp-cdktf** - The Google Cloud plugin
- **@stacksolo/plugin-kernel** - The shared services plugin
- **@stacksolo/runtime** - Runtime utilities for deployed apps

---

## License

MIT
