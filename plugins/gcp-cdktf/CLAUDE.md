# @stacksolo/plugin-gcp-cdktf

GCP provider plugin using CDKTF (Terraform CDK) for infrastructure deployment.

## Purpose

This plugin defines GCP resources that can be deployed via StackSolo:
- VPC Networks and Connectors
- Cloud Functions (Gen2)
- Load Balancers with path-based routing
- Storage buckets for static websites

## Architecture

```
src/
├── provider.ts       # Provider definition with auth validation
├── resources/
│   ├── index.ts      # Export all resources
│   ├── vpc-network.ts
│   ├── vpc-connector.ts
│   ├── cloud-function.ts
│   ├── load-balancer.ts
│   └── storage-website.ts
└── index.ts          # Public exports
```

## Available Resources

| Resource | ID | Description |
|----------|-----|-------------|
| VPC Network | `gcp-cdktf:vpc_network` | Private network |
| VPC Connector | `gcp-cdktf:vpc_connector` | Serverless VPC access |
| Cloud Function | `gcp-cdktf:cloud_function` | Gen2 serverless function |
| Load Balancer | `gcp-cdktf:load_balancer` | Global HTTP(S) LB |
| Storage Website | `gcp-cdktf:storage_website` | Static site hosting |

## Resource Definition Pattern

Each resource follows this structure:

```typescript
import { defineResource, type ResourceConfig } from '@stacksolo/core';

export const cloudFunction = defineResource({
  id: 'gcp-cdktf:cloud_function',
  provider: 'gcp-cdktf',
  name: 'Cloud Function',
  description: 'Serverless function (Gen2)',
  icon: 'functions',

  // JSON Schema for config validation
  configSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Function Name' },
      runtime: { type: 'string', enum: ['nodejs20', 'python311'] },
      // ...
    },
    required: ['name', 'location'],
  },

  // Default config values
  defaultConfig: {
    runtime: 'nodejs20',
    memory: '256Mi',
  },

  // Generate CDKTF TypeScript code
  generate: (config: ResourceConfig) => {
    return {
      imports: [
        'import { Cloudfunctions2Function } from "@cdktf/provider-google/lib/cloudfunctions2-function";',
      ],
      code: `
const ${varName} = new Cloudfunctions2Function(this, '${config.name}', {
  name: '${config.name}',
  location: '${config.location}',
  // ...
});
      `,
      outputs: ['url'],
    };
  },

  // Optional: cost estimation
  estimateCost: (config) => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [{ item: 'Cloud Functions', amount: 0 }],
  }),
});
```

## Generated Code

The `generate` function returns CDKTF TypeScript that gets assembled into a stack:

```typescript
// Generated output example:
import { Cloudfunctions2Function } from "@cdktf/provider-google/lib/cloudfunctions2-function";

const apiFunction = new Cloudfunctions2Function(this, 'api', {
  name: 'api',
  location: 'us-central1',
  buildConfig: {
    runtime: 'nodejs20',
    entryPoint: 'api',
    // ...
  },
  serviceConfig: {
    availableMemory: '256Mi',
    timeoutSeconds: 60,
    environmentVariables: {
      NODE_ENV: 'production',
      GCP_PROJECT_ID: '${var.project_id}',
    },
  },
});
```

## Development

```bash
# Build
pnpm --filter @stacksolo/plugin-gcp-cdktf build

# Test locally by running CLI deploy
cd /path/to/project
pnpm stacksolo deploy --dry-run
```

## Coding Practices

### Adding a New Resource

1. Create file in `src/resources/`:
```typescript
// src/resources/my-resource.ts
import { defineResource } from '@stacksolo/core';

export const myResource = defineResource({
  id: 'gcp-cdktf:my_resource',
  provider: 'gcp-cdktf',
  // ...
});
```

2. Export from `src/resources/index.ts`:
```typescript
export { myResource } from './my-resource.js';
```

3. Add to provider in `src/provider.ts`:
```typescript
resources: [
  // existing resources...
  myResource,
],
```

### Variable Naming
Use this helper for CDKTF variable names:
```typescript
function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}
```

### Config Schema Conventions
- Use `title` for human-readable labels
- Use `description` for help text
- Use `default` for sensible defaults
- Use `enum` for constrained choices
- Always include `required` array

### Environment Variables
Cloud Functions should inject these env vars in `serviceConfig`:
```typescript
environmentVariables: {
  NODE_ENV: 'production',
  GCP_PROJECT_ID: '${projectId}',
  STACKSOLO_PROJECT_NAME: '${projectName}', // if provided
  GATEWAY_URL: '${gatewayUrl}',             // if provided
}
```

### Output Values
Specify outputs that should be captured after deploy:
```typescript
outputs: ['url', 'imageUrl', 'selfLink']
```

These become available for cross-resource references: `${ref:myResource.url}`

### Cost Estimation
If the resource has variable pricing, implement `estimateCost`:
```typescript
estimateCost: (config) => {
  const instances = config.minInstances || 0;
  const hourlyRate = 0.00001667 * parseMemory(config.memory);
  return {
    monthly: instances * hourlyRate * 730,
    currency: 'USD',
    breakdown: [
      { item: `${instances} min instances`, amount: ... },
    ],
  };
}
```
