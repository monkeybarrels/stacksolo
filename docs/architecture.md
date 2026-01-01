# Architecture Overview

This document explains how StackSolo works internally. Read this if you want to understand the codebase, contribute, or build plugins.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER                                     │
│                                                                  │
│   stacksolo.config.json ───▶ stacksolo deploy ───▶ GCP Resources│
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLI PACKAGE                                 │
│                                                                  │
│   Commands: init, deploy, destroy, dev, scaffold, status        │
│   Uses: Commander.js for CLI parsing                            │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BLUEPRINT PACKAGE                              │
│                                                                  │
│   Parser ──▶ Resolver ──▶ Dependencies ──▶ Generator            │
│   (validate)  (expand)    (sort order)     (code gen)           │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CORE PACKAGE                                  │
│                                                                  │
│   Plugin Registry ◀── defineProvider() ◀── defineResource()    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PLUGINS                                     │
│                                                                  │
│   gcp-cdktf: Cloud Function, Load Balancer, Storage Website     │
│   kernel: Auth, Files, Events                                   │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│              INFRASTRUCTURE (CDKTF / Pulumi)                     │
│                                                                  │
│   Generated TypeScript ──▶ Terraform Plan ──▶ GCP API Calls     │
└─────────────────────────────────────────────────────────────────┘
```

## Package Overview

StackSolo is a monorepo with these packages:

| Package | Purpose | Key Files |
|---------|---------|-----------|
| `packages/cli` | CLI commands | `src/commands/`, `src/index.ts` |
| `packages/core` | Plugin system | `src/types.ts`, `src/registry.ts` |
| `packages/blueprint` | Config processing | `src/parser.ts`, `src/resolver.ts`, `src/generator.ts` |
| `packages/api` | Web API (optional) | `src/routes/`, `src/services/` |
| `packages/web` | Web UI (optional) | SvelteKit app |
| `packages/registry` | Global project DB | `src/db.ts`, `src/repositories/` |
| `packages/shared` | Shared types | `src/index.ts` |
| `plugins/gcp-cdktf` | GCP resources | `src/resources/` |
| `plugins/kernel` | Shared services | `src/resources/`, `service/` |

## The Deploy Flow

When you run `stacksolo deploy`, here's what happens:

### 1. Read Config

The CLI reads `.stacksolo/stacksolo.config.json`:

```typescript
// packages/cli/src/commands/infra/deploy.ts
const configPath = findConfigFile(process.cwd());
const config = parseConfig(configPath);
```

### 2. Validate Config

The blueprint package validates the config:

```typescript
// packages/blueprint/src/parser.ts
const result = validateConfig(config);
if (!result.valid) {
  throw new Error(result.errors.join('\n'));
}
```

Validation checks:
- Required fields exist (name, region, gcpProjectId)
- Resource names are valid (lowercase, 1-63 chars)
- References point to real resources
- No duplicate names

### 3. Resolve Resources

The resolver expands the compact config into individual resources:

```typescript
// packages/blueprint/src/resolver.ts
const resolved = resolveConfig(config);

// Input: { networks: [{ functions: [{...}] }] }
// Output: [
//   { id: 'function-api', type: 'gcp:cloud_function', config: {...} }
// ]
```

### 4. Sort Dependencies

The dependency module figures out the deployment order:

```typescript
// packages/blueprint/src/dependencies.ts
const graph = buildDependencyGraph(resolved.resources);
const order = topologicalSort(graph);

// If function-api needs database-main,
// database-main deploys first
```

### 5. Generate Code

The generator creates CDKTF TypeScript code:

```typescript
// packages/blueprint/src/generator.ts
const code = generatePulumiProgram(resolved);

// Output: A complete index.ts file with imports and resources
```

Each resource type has a `generate()` function that outputs:
- `imports`: Required import statements
- `code`: The CDKTF construct code
- `outputs`: Export statements

### 6. Run Terraform

The CLI runs Terraform through CDKTF:

```bash
cdktf deploy --auto-approve
```

## The Plugin System

Plugins define what resources StackSolo can create.

### Plugin Interface

```typescript
// packages/core/src/types.ts

interface Plugin {
  providers?: Provider[];
  resources?: ResourceType[];
  patterns?: AppPattern[];
}

interface Provider {
  id: string;              // 'gcp-cdktf'
  name: string;            // 'Google Cloud Platform (CDKTF)'
  auth: AuthMethod;        // How to authenticate
  resources: ResourceType[];
}

interface ResourceType {
  id: string;              // 'gcp-cdktf:cloud_function'
  provider: string;        // 'gcp-cdktf'
  name: string;            // 'Cloud Function'
  configSchema: JSONSchema;
  defaultConfig: Record<string, unknown>;
  generate: (config) => GeneratedCode;
}
```

### How Plugins Register

Plugins are discovered automatically from:
- `plugins/*` in the monorepo
- `@stacksolo/plugin-*` npm packages
- `stacksolo-plugin-*` npm packages

Each plugin exports a default object:

```typescript
// plugins/gcp-cdktf/src/index.ts
import { gcpCdktfProvider } from './provider';

export const plugin = {
  providers: [gcpCdktfProvider],
};

export default plugin;
```

The registry stores all plugins:

```typescript
// packages/core/src/registry.ts
class PluginRegistry {
  private providers = new Map<string, Provider>();
  private resources = new Map<string, ResourceType>();

  registerPlugin(plugin: Plugin) {
    plugin.providers?.forEach(p => this.registerProvider(p));
    // ...
  }

  getResource(id: string): ResourceType | undefined {
    return this.resources.get(id);
  }
}

export const registry = new PluginRegistry();
```

## The Reference System

References let resources refer to each other using `@type/name.property` syntax.

### How It Works

```json
{
  "containers": [{
    "name": "api",
    "env": {
      "DATABASE_URL": "@database/main.connectionString"
    }
  }],
  "databases": [{
    "name": "main"
  }]
}
```

The reference system:

1. **Parses** the reference:
   ```typescript
   parseReference("@database/main.connectionString")
   // { type: 'database', name: 'main', property: 'connectionString' }
   ```

2. **Extracts** dependencies:
   ```typescript
   extractDependencies(containerResource)
   // ['database-main']
   ```

3. **Resolves** to Pulumi interpolation:
   ```typescript
   resolveReference("@database/main.connectionString")
   // "${mainConnectionString}"
   ```

### Supported References

| Type | Properties | Default |
|------|------------|---------|
| `@secret/name` | id, name, version | secretId |
| `@database/name` | connectionString, privateIp, publicIp, instanceName | connectionString |
| `@bucket/name` | name, url, selfLink | name |
| `@cache/name` | host, port, connectionString, authString | host |
| `@container/name` | url, name | url |
| `@function/name` | url, name | url |
| `@topic/name` | name, id | name |
| `@queue/name` | name, id | name |
| `@network/name` | name, id, selfLink | selfLink |
| `@ui/name` | url, bucketName, name | url |
| `@kernel/name` | url, authUrl, natsUrl | url |

## File Structure

```
stacksolo/
├── packages/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── project/     # init, scaffold
│   │   │   │   ├── infra/       # deploy, destroy, status
│   │   │   │   ├── dev/         # dev, build, serve
│   │   │   │   └── config/      # config, env
│   │   │   ├── generators/      # K8s manifest generators
│   │   │   ├── gcp/             # GCP utilities
│   │   │   ├── services/        # Deploy service
│   │   │   └── index.ts         # CLI entry point
│   │   └── package.json
│   │
│   ├── core/
│   │   ├── src/
│   │   │   ├── types.ts         # Plugin interfaces
│   │   │   ├── registry.ts      # Plugin registry
│   │   │   ├── define.ts        # defineProvider, defineResource
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── blueprint/
│   │   ├── src/
│   │   │   ├── schema.ts        # Config schema types
│   │   │   ├── parser.ts        # Config parsing & validation
│   │   │   ├── resolver.ts      # Resource resolution
│   │   │   ├── dependencies.ts  # Dependency sorting
│   │   │   ├── references.ts    # @type/name resolution
│   │   │   ├── generator.ts     # Code generation
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── api/                     # Optional web API
│   ├── web/                     # Optional web UI
│   ├── registry/                # Global project database
│   └── shared/                  # Shared types
│
├── plugins/
│   ├── gcp-cdktf/
│   │   ├── src/
│   │   │   ├── provider.ts      # Provider definition
│   │   │   ├── resources/
│   │   │   │   ├── cloud-function.ts
│   │   │   │   ├── load-balancer.ts
│   │   │   │   ├── storage-website.ts
│   │   │   │   ├── vpc-network.ts
│   │   │   │   └── vpc-connector.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── kernel/
│       ├── src/                 # Plugin code
│       ├── service/             # Kernel service code
│       └── package.json
│
├── docs/                        # Documentation
├── pnpm-workspace.yaml
└── package.json
```

## Key Interfaces

### ResourceConfig

What gets passed to a resource's `generate()` function:

```typescript
interface ResourceConfig {
  name: string;
  [key: string]: unknown;
}
```

### GeneratedCode

What a resource's `generate()` function returns:

```typescript
interface GeneratedCode {
  imports: string[];    // ["import { X } from 'y';"]
  code: string;         // The CDKTF construct code
  outputs?: string[];   // ["export const xUrl = x.url;"]
}
```

### ResolvedResource

Internal representation of a resource:

```typescript
interface ResolvedResource {
  id: string;           // "function-api"
  type: string;         // "gcp:cloud_function"
  name: string;         // "api"
  config: Record<string, unknown>;
  dependsOn: string[];  // ["database-main"]
  network?: string;     // "main"
}
```

## Development Setup

```bash
# Clone the repo
git clone https://github.com/monkeybarrels/stacksolo
cd stacksolo

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Link CLI globally for testing
pnpm cli:link

# Start dev mode (API + Web)
pnpm dev
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
cd packages/blueprint
pnpm test
```

## Adding a New Resource Type

See [Plugin Development](./plugin-development.md) for a complete guide.

Quick version:

1. Create a file in `plugins/gcp-cdktf/src/resources/`
2. Use `defineResource()` to define it
3. Export it from `plugins/gcp-cdktf/src/resources/index.ts`
4. Add it to the provider's resources array