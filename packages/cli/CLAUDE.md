# @stacksolo/cli

Command-line interface for StackSolo infrastructure deployment.

## Purpose

This is the main entry point for users. It provides commands to:
- Initialize new projects (`stacksolo init`)
- Deploy infrastructure to GCP (`stacksolo deploy`)
- Run local K8s development (`stacksolo dev`)
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
- `gateway.ts` - Kong gateway for routing
- `emulators.ts` - Firebase emulator pods
- `configmap.ts` - Environment variable injection

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
