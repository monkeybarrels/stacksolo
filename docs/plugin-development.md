# Plugin Development Guide

This guide teaches you how to create plugins for StackSolo. Plugins add new resource types (like databases, queues, or custom services) that users can deploy.

## What is a Plugin?

A plugin is a package that registers:
- **Providers** - Cloud platforms (like GCP, AWS)
- **Resources** - Things you can deploy (like functions, databases)
- **Patterns** - Pre-built app templates (optional)

## Quick Example

Here's a minimal plugin that adds a custom resource:

```typescript
// my-plugin/src/index.ts
import type { Plugin } from '@stacksolo/core';
import { defineProvider, defineResource } from '@stacksolo/core';

const myResource = defineResource({
  id: 'my-plugin:hello',
  provider: 'my-plugin',
  name: 'Hello World',
  description: 'A simple hello world resource',
  icon: 'star',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        description: 'Name to greet',
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    name: 'World',
  },

  generate: (config) => ({
    imports: [],
    code: `// Hello ${config.name}!`,
    outputs: [],
  }),
});

const myProvider = defineProvider({
  id: 'my-plugin',
  name: 'My Plugin',
  icon: 'puzzle',
  auth: {
    type: 'cli',
    instructions: 'No auth needed',
    validate: async () => true,
  },
  resources: [myResource],
});

const plugin: Plugin = {
  providers: [myProvider],
};

export default plugin;
```

---

## Setting Up a Plugin Project

### 1. Create the Directory Structure

```
my-plugin/
├── src/
│   ├── index.ts         # Plugin entry point
│   ├── provider.ts      # Provider definition
│   └── resources/       # Resource definitions
│       ├── index.ts
│       └── my-resource.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### 2. Create package.json

```json
{
  "name": "@stacksolo/plugin-my-plugin",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@stacksolo/core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.3.0"
  }
}
```

**Naming:** Use `@stacksolo/plugin-*` or `stacksolo-plugin-*` for auto-discovery.

### 3. Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### 4. Create tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

---

## Defining a Provider

A provider represents a cloud platform. It defines authentication and lists available resources.

```typescript
// src/provider.ts
import { defineProvider } from '@stacksolo/core';
import { exec } from 'child_process';
import { promisify } from 'util';
import { myResource } from './resources/index.js';

const execAsync = promisify(exec);

export const myProvider = defineProvider({
  // Unique identifier for this provider
  id: 'my-provider',

  // Display name
  name: 'My Cloud Provider',

  // Icon (used in UI)
  icon: 'cloud',

  // Authentication configuration
  auth: {
    // Auth type: 'cli', 'service_account', 'api_key', or 'oauth'
    type: 'cli',

    // CLI command (for type: 'cli')
    command: 'mycloud',

    // Instructions shown to users
    instructions: `
To authenticate:
1. Install the CLI: npm install -g mycloud-cli
2. Run: mycloud login
3. Select your project
    `.trim(),

    // Validation function - checks if auth is set up
    validate: async (): Promise<boolean> => {
      try {
        const { stdout } = await execAsync('mycloud auth status');
        return stdout.includes('authenticated');
      } catch {
        return false;
      }
    },
  },

  // Resources this provider offers
  resources: [myResource],
});
```

### Provider Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique provider ID (e.g., `gcp-cdktf`) |
| `name` | string | Yes | Display name |
| `icon` | string | Yes | Icon name |
| `auth` | AuthMethod | Yes | Authentication configuration |
| `resources` | ResourceType[] | Yes | Available resources |

---

## Defining a Resource

Resources are the core of plugins. Each resource generates CDKTF code.

```typescript
// src/resources/storage-bucket.ts
import { defineResource, type ResourceConfig } from '@stacksolo/core';

// Helper to create valid variable names
function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const storageBucket = defineResource({
  // Unique identifier: provider:resource_name
  id: 'my-provider:storage_bucket',

  // Provider this belongs to
  provider: 'my-provider',

  // Display name
  name: 'Storage Bucket',

  // Description
  description: 'Object storage bucket for files',

  // Icon
  icon: 'folder',

  // JSON Schema for configuration
  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Bucket Name',
        description: 'Unique name for the bucket',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'Geographic location',
        default: 'US',
        enum: ['US', 'EU', 'ASIA'],
      },
      publicAccess: {
        type: 'boolean',
        title: 'Public Access',
        description: 'Allow public read access',
        default: false,
      },
    },
    required: ['name'],
  },

  // Default values
  defaultConfig: {
    location: 'US',
    publicAccess: false,
  },

  // Code generation function
  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const bucketConfig = config as {
      name: string;
      location?: string;
      publicAccess?: boolean;
      projectId?: string;
    };

    const location = bucketConfig.location || 'US';
    const publicAccess = bucketConfig.publicAccess ?? false;
    const projectId = bucketConfig.projectId || '${var.project_id}';

    let code = `// Storage bucket: ${config.name}
const ${varName}Bucket = new StorageBucket(this, '${config.name}', {
  name: '${projectId}-${config.name}',
  location: '${location}',
  uniformBucketLevelAccess: true,
  forceDestroy: true,
});`;

    // Add public access if enabled
    if (publicAccess) {
      code += `

// Public access for ${config.name}
new StorageBucketIamMember(this, '${config.name}-public', {
  bucket: ${varName}Bucket.name,
  role: 'roles/storage.objectViewer',
  member: 'allUsers',
});`;
    }

    return {
      imports: [
        "import { StorageBucket } from '@cdktf/provider-google/lib/storage-bucket';",
        "import { StorageBucketIamMember } from '@cdktf/provider-google/lib/storage-bucket-iam-member';",
      ],
      code,
      outputs: [
        `export const ${varName}BucketName = ${varName}Bucket.name;`,
        `export const ${varName}BucketUrl = ${varName}Bucket.url;`,
      ],
    };
  },

  // Optional: Cost estimation
  estimateCost: (config: ResourceConfig) => {
    return {
      monthly: 0.02,
      currency: 'USD',
      breakdown: [
        { item: 'Storage (estimated 1GB)', amount: 0.02 },
      ],
    };
  },
});
```

### Resource Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID: `provider:resource_name` |
| `provider` | string | Yes | Provider ID this resource belongs to |
| `name` | string | Yes | Display name |
| `description` | string | Yes | Description |
| `icon` | string | Yes | Icon name |
| `configSchema` | JSONSchema | Yes | JSON Schema for config validation |
| `defaultConfig` | object | Yes | Default configuration values |
| `generate` | function | Yes | Code generation function |
| `estimateCost` | function | No | Cost estimation function |

---

## The generate() Function

This is where the magic happens. The `generate()` function takes config and returns CDKTF code.

### Input: ResourceConfig

```typescript
interface ResourceConfig {
  name: string;           // Resource name from user config
  [key: string]: unknown; // Other config properties
}
```

The config also includes injected values:
- `projectId` - GCP project ID
- `region` - Deployment region

### Output: GeneratedCode

```typescript
interface GeneratedCode {
  imports: string[];   // Import statements
  code: string;        // CDKTF construct code
  outputs?: string[];  // Output exports
}
```

### Example Output

For a storage bucket named "uploads", `generate()` might return:

```typescript
{
  imports: [
    "import { StorageBucket } from '@cdktf/provider-google/lib/storage-bucket';",
  ],
  code: `const uploadsBucket = new StorageBucket(this, 'uploads', {
  name: 'my-project-uploads',
  location: 'US',
});`,
  outputs: [
    "export const uploadsBucketName = uploadsBucket.name;",
  ],
}
```

### Code Generation Tips

1. **Variable Names**: Use the helper to create valid JavaScript variable names:
   ```typescript
   function toVariableName(name: string): string {
     return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
   }
   ```

2. **Project ID**: Use `${var.project_id}` for Terraform variable interpolation:
   ```typescript
   const projectId = config.projectId || '${var.project_id}';
   ```

3. **Unique Names**: Prefix resource names with project ID to ensure uniqueness:
   ```typescript
   name: '${projectId}-${config.name}'
   ```

4. **Dependencies**: Reference other resources using their variable names:
   ```typescript
   bucket: myBucket.name  // Reference another resource
   ```

---

## Adding References

If your resource has outputs other resources can use, add them to the reference system.

### 1. Update schema.ts

```typescript
// packages/blueprint/src/schema.ts

export type ReferenceType =
  | 'secret'
  | 'database'
  // ... existing types
  | 'myresource';  // Add your type
```

### 2. Update references.ts

```typescript
// packages/blueprint/src/references.ts

const outputMappings: Record<string, Record<string, string>> = {
  // ... existing mappings
  myresource: {
    default: 'url',           // Default property
    url: 'Url',               // @myresource/name.url
    name: 'Name',             // @myresource/name.name
    id: 'Id',                 // @myresource/name.id
  },
};

// Add to validTypes array
const validTypes = [
  'secret', 'database', /* ... */ 'myresource'
];
```

Now users can use `@myresource/name.url` in their config.

---

## Plugin Entry Point

Export your plugin as the default export:

```typescript
// src/index.ts
import type { Plugin } from '@stacksolo/core';
import { myProvider } from './provider.js';

// Named exports for direct imports
export { myProvider } from './provider.js';
export { myResource } from './resources/index.js';

// Default export for plugin discovery
const plugin: Plugin = {
  providers: [myProvider],
  patterns: [],  // Optional app patterns
};

export default plugin;
```

---

## Plugin Discovery

StackSolo finds plugins automatically from:

1. **npm packages**: `@stacksolo/plugin-*` or `stacksolo-plugin-*`
2. **Local plugins**: `./stacksolo-plugins/` in your project
3. **User plugins**: `~/.stacksolo/plugins/`

### Manual Registration

You can also register plugins in `stacksolo.config.ts`:

```typescript
import myPlugin from 'my-plugin';

export default {
  plugins: [myPlugin],
  // ... rest of config
};
```

---

## Testing Your Plugin

### 1. Build the Plugin

```bash
cd my-plugin
pnpm build
```

### 2. Link for Local Testing

```bash
pnpm link --global
```

### 3. Test in a Project

Create a test config that uses your resource:

```json
{
  "project": {
    "name": "test",
    "region": "us-central1",
    "gcpProjectId": "my-project",
    "networks": [
      {
        "name": "main",
        "myresources": [
          { "name": "test-resource" }
        ]
      }
    ]
  }
}
```

### 4. Preview Generated Code

```bash
stacksolo deploy --preview
```

---

## Complete Plugin Example

Here's a full plugin that adds a "Notification Service" resource:

```typescript
// notification-plugin/src/resources/notification.ts
import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const notificationService = defineResource({
  id: 'notifications:service',
  provider: 'notifications',
  name: 'Notification Service',
  description: 'Push notification service for mobile and web apps',
  icon: 'bell',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Service Name',
        minLength: 1,
        maxLength: 63,
      },
      platforms: {
        type: 'array',
        title: 'Platforms',
        description: 'Target platforms',
        items: { type: 'string', enum: ['ios', 'android', 'web'] },
        default: ['web'],
      },
      dailyLimit: {
        type: 'number',
        title: 'Daily Limit',
        description: 'Max notifications per day',
        default: 10000,
        minimum: 100,
        maximum: 1000000,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    platforms: ['web'],
    dailyLimit: 10000,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const notifConfig = config as {
      name: string;
      platforms?: string[];
      dailyLimit?: number;
      projectId?: string;
    };

    const platforms = notifConfig.platforms || ['web'];
    const dailyLimit = notifConfig.dailyLimit || 10000;
    const projectId = notifConfig.projectId || '${var.project_id}';

    const code = `// Notification Service: ${config.name}
const ${varName}Topic = new PubsubTopic(this, '${config.name}-topic', {
  name: '${config.name}-notifications',
});

const ${varName}Function = new Cloudfunctions2Function(this, '${config.name}', {
  name: '${config.name}',
  location: 'us-central1',
  buildConfig: {
    runtime: 'nodejs20',
    entryPoint: 'handleNotification',
    source: {
      storageSource: {
        bucket: '${projectId}-notifications-source',
        object: 'source.zip',
      },
    },
  },
  serviceConfig: {
    environmentVariables: {
      PLATFORMS: '${platforms.join(',')}',
      DAILY_LIMIT: '${dailyLimit}',
    },
  },
  eventTrigger: {
    triggerRegion: 'us-central1',
    eventType: 'google.cloud.pubsub.topic.v1.messagePublished',
    pubsubTopic: ${varName}Topic.id,
  },
});`;

    return {
      imports: [
        "import { PubsubTopic } from '@cdktf/provider-google/lib/pubsub-topic';",
        "import { Cloudfunctions2Function } from '@cdktf/provider-google/lib/cloudfunctions2-function';",
      ],
      code,
      outputs: [
        `export const ${varName}TopicName = ${varName}Topic.name;`,
        `export const ${varName}FunctionUrl = ${varName}Function.url;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 5,
    currency: 'USD',
    breakdown: [
      { item: 'Pub/Sub messages', amount: 1 },
      { item: 'Cloud Function invocations', amount: 4 },
    ],
  }),
});
```

```typescript
// notification-plugin/src/provider.ts
import { defineProvider } from '@stacksolo/core';
import { notificationService } from './resources/notification.js';

export const notificationsProvider = defineProvider({
  id: 'notifications',
  name: 'Notification Services',
  icon: 'bell',
  auth: {
    type: 'cli',
    command: 'gcloud',
    instructions: 'Uses GCP authentication. Run: gcloud auth login',
    validate: async () => true,
  },
  resources: [notificationService],
});
```

```typescript
// notification-plugin/src/index.ts
import type { Plugin } from '@stacksolo/core';
import { notificationsProvider } from './provider.js';

export { notificationsProvider };
export { notificationService } from './resources/notification.js';

const plugin: Plugin = {
  providers: [notificationsProvider],
};

export default plugin;
```

---

## Best Practices

1. **Use clear IDs**: `provider:resource_name` format
2. **Provide good defaults**: Users shouldn't need to configure everything
3. **Validate inputs**: Use JSON Schema constraints
4. **Document everything**: Add descriptions to all config properties
5. **Handle errors gracefully**: Check for missing values in `generate()`
6. **Test generated code**: Make sure it's valid CDKTF/Terraform
7. **Estimate costs**: Help users understand what they'll pay
8. **Keep imports minimal**: Only import what you need
9. **Use consistent naming**: Variable names should be predictable
10. **Support references**: Let other resources use your outputs

---

## Troubleshooting

### Plugin Not Found

- Check the package name starts with `@stacksolo/plugin-` or `stacksolo-plugin-`
- Make sure the plugin is installed: `pnpm add my-plugin`
- Check the default export is a Plugin object

### Generated Code Errors

- Validate variable names don't start with numbers
- Check for syntax errors in string templates
- Ensure all imports are included
- Test with `stacksolo deploy --preview`

### Type Errors

- Make sure `@stacksolo/core` is a dependency
- Use `workspace:*` for local development
- Run `pnpm build` before testing