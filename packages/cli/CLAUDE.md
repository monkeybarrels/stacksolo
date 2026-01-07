# @stacksolo/cli

Command-line interface for StackSolo infrastructure deployment.

## Purpose

This is the main entry point for users. It provides commands to:
- Initialize new projects (`stacksolo init`)
- Deploy infrastructure to GCP (`stacksolo deploy`)
- Run local K8s development (`stacksolo dev`)
- Scaffold project resources (`stacksolo scaffold`)
- Manage the global project registry

## Architecture

```
src/
├── index.ts              # CLI entry point (commander setup)
├── commands/
│   ├── project/          # init, scaffold
│   ├── infra/            # deploy, destroy, status, list
│   ├── dev/              # dev, build, install, serve
│   └── config/           # config, env, register, unregister
├── generators/
│   └── k8s/              # Kubernetes manifest generators
├── scaffold/
│   └── generators/       # Project template generators
│       └── resources/    # Function, Kernel, UI scaffolders
├── gcp/                  # GCP CLI wrappers (gcloud, APIs, IAM)
├── services/             # Business logic services
└── templates/            # Project scaffolding templates
```

## Key Patterns

### Command Structure
Each command is a Commander.js command exported from its file:
```typescript
export const deployCommand = new Command('deploy')
  .description('Deploy infrastructure')
  .option('--dry-run', 'Preview without deploying')
  .action(async (options) => { ... });
```

### K8s Manifest Generation
The `generators/k8s/` directory generates Kubernetes manifests for local dev:
- `function.ts` - Deployment + Service for Cloud Functions
- `gateway.ts` - Nginx gateway for routing
- `kernel.ts` - Kernel container (NATS + HTTP server)
- `ui.ts` - Frontend UI deployments
- `emulators.ts` - Firebase emulator pods
- `configmap.ts` - Environment variable injection

**Important:** The K8s generators must align with scaffold generators for source paths:
- Functions: `functions/<name>` (default) or `func.sourceDir`
- UIs: `ui/<name>` (default) or `ui.sourceDir`
- Containers: `containers/<name>` (default) or `container.sourceDir`

### GCP Integration
The `gcp/` directory wraps gcloud CLI commands:
- `projects.ts` - Project creation, billing
- `apis.ts` - Enable GCP APIs
- `org-policy.ts` - Org policy fixes
- `iam.ts` - Service account permissions

## Development

```bash
# Build
pnpm --filter @stacksolo/cli build

# Test locally
pnpm stacksolo --help
pnpm stacksolo init

# Run tests
pnpm --filter @stacksolo/cli test
```

## Dependencies

- `@stacksolo/blueprint` - Config parsing and validation
- `@stacksolo/registry` - Global project registry (~/.stacksolo)
- `@stacksolo/core` - Plugin system types
- `@stacksolo/plugin-gcp-cdktf` - GCP resource definitions

## Config Files

The CLI reads/writes these files:
- `.stacksolo/stacksolo.config.json` - Project configuration
- `.stacksolo/state.json` - Local project state
- `~/.stacksolo/registry.db` - Global project registry (SQLite)

## TypeScript Build Patterns

**CRITICAL: Always use tsup for bundling TypeScript. Never use .js extensions in imports.**

### Function Scaffolding
Functions use tsup with watch mode for development:
```json
{
  "scripts": {
    "dev": "tsup src/index.ts --format esm --target node20 --watch --onSuccess 'functions-framework --source=dist --target=handler'",
    "build": "tsup src/index.ts --format esm --target node20",
    "start": "functions-framework --source=dist --target=handler"
  }
}
```

### Kernel/Container Scaffolding
Containers use tsup for build, tsx for development:
```json
{
  "scripts": {
    "build": "tsup src/index.ts --format esm --target node20 --dts",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  }
}
```

### ESM Import Rules
- **Never use directory imports** like `import from './http'`
- **Always use explicit index imports** like `import from './http/index'`
- tsup bundles everything, so extensionless imports work
- Node.js ESM does not support directory imports without explicit `/index`

## K8s Dev Environment

### Prerequisites
Before running `stacksolo dev`:
1. Docker Desktop or OrbStack with Kubernetes enabled
2. ConfigMap `stacksolo-env` must exist (created by `configmap.ts` generator)

### Common Issues
- **"Provided code location '/app' is not a loadable module"**: TypeScript not compiled. Ensure `npm run dev` uses tsup to build before starting functions-framework.
- **ESM directory import errors**: Change `'./dir'` to `'./dir/index'` in imports.
- **nginx invalid directive**: Use valid nginx directives (`keepalive_timeout`, `proxy_connect_timeout`, `proxy_read_timeout`).
- **Firestore ECONNREFUSED**: Firebase emulator binds to 127.0.0.1 by default. Use a ConfigMap with `firebase.json` to set `"host": "0.0.0.0"` for each emulator.

### Emulator Configuration
Firebase emulators must bind to `0.0.0.0` to be accessible from other pods. This is done via a ConfigMap mounting `firebase.json`:

```json
{
  "emulators": {
    "firestore": { "host": "0.0.0.0", "port": 8080 },
    "auth": { "host": "0.0.0.0", "port": 9099 },
    "ui": { "enabled": true, "host": "0.0.0.0", "port": 4000 }
  }
}
```

The `emulators.ts` generator creates this ConfigMap and mounts it at `/home/node/firebase.json` with `workingDir: /home/node`.

**Key insight:** The `--host` CLI flag doesn't work with all Firebase versions. Use `firebase.json` for reliable cross-pod connectivity.

## Common Tasks

### Adding a New Command
1. Create file in appropriate `commands/` subdirectory
2. Export the command from the subdirectory's `index.ts`
3. Import and add to `src/index.ts`

### Adding a K8s Resource Generator
1. Create file in `generators/k8s/`
2. Export generator function that returns `GeneratedManifest`
3. Import in `generators/k8s/index.ts`
4. Call from `commands/dev/dev.ts`

### Modifying Deploy Logic
The deploy flow is in `commands/infra/deploy.ts`:
1. Parse config via `@stacksolo/blueprint`
2. Generate CDKTF code via plugin
3. Run Terraform via child process
4. Update registry with results

## Remote Content (Templates, Stacks, Architectures)

The CLI fetches templates, stacks, and architectures from the `stacksolo-architectures` GitHub repository.

### Content Types

| Type | Description | Index File | Detail File | CLI Command |
|------|-------------|------------|-------------|-------------|
| **Templates** | Scaffolded starter code (React, Vue, Express) | `templates.json` | `{path}/template.json` | `stacksolo init --template <id>` |
| **Stacks** | Complete deployable applications | `stacks.json` | `{path}/stack.json` | `stacksolo clone <id>` |
| **Architectures** | Config-only patterns | `index.json` | `{path}/config.json` | Copy config manually |

### Unified GitHub Service

All remote fetching uses `services/github.service.ts`:

```typescript
import { fetchJson, downloadDirectory, parseRepo } from './services/github.service';

const REPO = parseRepo('monkeybarrels/stacksolo-architectures', 'main');

// Fetch a JSON file
const index = await fetchJson<StacksIndex>('stacks.json', REPO);

// Download a directory (tarball extraction)
await downloadDirectory('stacks/rag-platform', outputDir, REPO, {
  onProgress: (msg) => console.log(msg),
});
```

**Key features:**
- Single tarball download for directories (efficient, no API rate limits)
- 15-minute in-memory cache
- Variable substitution (`{{variableName}}` pattern)

### Adding a New Content Type

To add a new content type (e.g., "plugins"):

1. **Create index file** in `stacksolo-architectures` repo:
   ```json
   // plugins.json
   {
     "version": "1",
     "plugins": [
       {
         "id": "my-plugin",
         "name": "My Plugin",
         "description": "...",
         "tags": ["auth"],
         "difficulty": "beginner",
         "path": "plugins/my-plugin"
       }
     ]
   }
   ```

2. **Create detail file** for each item:
   ```json
   // plugins/my-plugin/plugin.json
   {
     "id": "my-plugin",
     "name": "My Plugin",
     "version": "1.0.0",
     "variables": { ... }
   }
   ```

3. **Add CLI support** in `packages/cli/`:
   - Create command in `commands/project/` or extend existing command
   - Use `fetchJson()` for index, `downloadDirectory()` for full download
   - Follow the pattern in `clone.ts` for stacks

4. **Add MCP support** in `packages/mcp-knowledge/`:
   - Create knowledge file in `knowledge/`
   - Create tool in `tools/`
   - Export from `tools/index.ts`

### Index File Structure

All index files follow this pattern:

```typescript
interface ContentIndex {
  version: string;
  items: Array<{
    id: string;           // Unique identifier (used in CLI)
    name: string;         // Display name
    description: string;  // Short description
    tags: string[];       // Searchable tags
    difficulty: string;   // beginner | intermediate | advanced
    path: string;         // Path in repo (e.g., "stacks/rag-platform")
  }>;
}
```

### Variable Substitution

Templates and stacks support `{{variableName}}` placeholders:

```typescript
import { substituteVariables, substituteVariablesInDirectory } from './services/github.service';

// Single string
const processed = substituteVariables(content, { projectName: 'my-app' });

// All files in a directory
await substituteVariablesInDirectory(outputDir, { projectName: 'my-app' });
```

### Testing Remote Content

```bash
# List available stacks
stacksolo clone --list

# Clone a stack
stacksolo clone rag-platform my-project

# Init with template
stacksolo init --template firebase-app
```

### Caching Behavior

- Index files are cached for 15 minutes
- Tarball downloads are not cached (downloaded fresh each time)
- To force refresh, wait 15 minutes or restart the CLI
