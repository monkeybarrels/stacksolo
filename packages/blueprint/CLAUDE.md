# @stacksolo/blueprint

Configuration parser, validator, and code generator for StackSolo.

## Purpose

This package:
- Parses `stacksolo.config.json` files
- Validates configuration against schema
- Resolves resource references
- Generates CDKTF/Terraform code

## Architecture

```
src/
├── schema.ts        # TypeScript types for config structure
├── parser.ts        # JSON parsing and file discovery
├── resolver.ts      # Flatten networks into resource list
├── references.ts    # Parse ${ref:...} references
├── dependencies.ts  # Build dependency graph, topological sort
├── generator.ts     # Generate CDKTF TypeScript code
└── index.ts         # Public exports
```

## Config Structure

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1"
  },
  "networks": {
    "main": {
      "functions": {
        "api": {
          "runtime": "nodejs20",
          "sourceDir": "functions/api"
        }
      },
      "buckets": {
        "uploads": {
          "location": "US"
        }
      }
    }
  }
}
```

## Key Concepts

### Networks
Resources are grouped into networks. Each network creates a VPC and all resources within share it.

### References
Resources can reference other resources:
```json
{
  "env": {
    "BUCKET_URL": "${ref:uploads.url}"
  }
}
```

Reference format: `${ref:resourceName.outputProperty}`

### Dependency Resolution
The `dependencies.ts` module:
1. Parses references to build a dependency graph
2. Detects circular dependencies
3. Returns resources in topological order

## Usage

### Full Pipeline
```typescript
import { processConfig } from '@stacksolo/blueprint';

const result = processConfig('/path/to/stacksolo.config.json');
if (result.valid) {
  console.log(result.code); // CDKTF TypeScript
}
```

### Individual Steps
```typescript
import {
  parseConfig,
  validateConfig,
  resolveConfig,
  resolveWithOrder,
  generatePulumiProgram,
} from '@stacksolo/blueprint';

// Parse JSON
const config = parseConfig(configPath);

// Validate
const validation = validateConfig(config);
if (!validation.valid) {
  console.error(validation.errors);
}

// Resolve to flat resource list
const resolved = resolveConfig(config);

// Add dependency order
const ordered = resolveWithOrder(resolved);

// Generate code
const code = generatePulumiProgram(ordered);
```

## Development

```bash
# Build (uses tsc)
pnpm --filter @stacksolo/blueprint build

# Run tests
pnpm --filter @stacksolo/blueprint test
```

## Coding Practices

### Schema Types
Config types are defined in `schema.ts`:
```typescript
interface FunctionConfig {
  runtime?: string;
  sourceDir: string;
  entryPoint?: string;
  memory?: string;
  timeout?: number;
  env?: Record<string, string>;
}
```

### Adding a New Resource Type
1. Add config type to `schema.ts`
2. Add to `NetworkConfig` interface
3. Update `resolver.ts` to flatten it
4. Update `generator.ts` to generate code
5. Add tests in `__tests__/`

### Reference Resolution
References are resolved in two phases:
1. **Parse time**: Extract reference strings from config
2. **Generate time**: Convert to CDKTF variable references

```typescript
// Input: "${ref:api.url}"
// Output: "${googleCloudfunctions2Function.api.url}"
```

### Validation Errors
Return structured errors:
```typescript
interface ValidationError {
  path: string;      // e.g., "networks.main.functions.api.runtime"
  message: string;   // e.g., "Invalid runtime: python4.0"
  code?: string;     // e.g., "INVALID_RUNTIME"
}
```

### Config File Discovery
The parser searches for config in order:
1. `.stacksolo/stacksolo.config.json`
2. `stacksolo.config.json`
3. `.stacksolo/config.json`
