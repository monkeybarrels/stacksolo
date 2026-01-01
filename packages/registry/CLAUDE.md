# @stacksolo/registry

Global project registry stored at `~/.stacksolo/registry.db`. Tracks all StackSolo projects on the machine.

## Purpose

This package provides:
- SQLite database for project/resource tracking
- Cross-project resource references (`@project/resource.output`)
- Deployment history and status

## Architecture

```
src/
├── db.ts                    # Kysely database setup
├── schema.ts                # Database schema definitions
├── types.ts                 # Public TypeScript types
├── repositories/
│   ├── project.repository.ts
│   ├── resource.repository.ts
│   └── deployment.repository.ts
├── services/
│   ├── registry.service.ts  # Main registry API
│   └── reference.service.ts # Cross-project references
└── index.ts                 # Public exports
```

## Database Schema

### projects
```sql
id              TEXT PRIMARY KEY
name            TEXT UNIQUE NOT NULL
gcp_project_id  TEXT NOT NULL
region          TEXT NOT NULL
config_path     TEXT
config_hash     TEXT
status          TEXT DEFAULT 'pending'
last_deployed_at TEXT
created_at      TEXT NOT NULL
updated_at      TEXT NOT NULL
```

### resources
```sql
id              TEXT PRIMARY KEY
project_id      TEXT NOT NULL REFERENCES projects(id)
type            TEXT NOT NULL  -- 'function', 'container', 'bucket'
name            TEXT NOT NULL
network         TEXT           -- network grouping
resource_type   TEXT NOT NULL  -- 'gcp-cdktf:cloud_function'
config          TEXT NOT NULL  -- JSON blob
outputs         TEXT           -- JSON blob (url, imageUrl, etc.)
status          TEXT DEFAULT 'pending'
pulumi_urn      TEXT
last_deployed_at TEXT
```

### deployments
```sql
id              TEXT PRIMARY KEY
project_id      TEXT NOT NULL REFERENCES projects(id)
action          TEXT NOT NULL  -- 'deploy', 'destroy'
status          TEXT NOT NULL  -- 'running', 'succeeded', 'failed'
config_snapshot TEXT NOT NULL  -- JSON blob
log_path        TEXT
error           TEXT
started_at      TEXT NOT NULL
completed_at    TEXT
```

## Usage

### Getting the Registry
```typescript
import { getRegistry } from '@stacksolo/registry';

const registry = getRegistry();
```

### Project Operations
```typescript
// Register a project
await registry.registerProject({
  name: 'my-app',
  gcpProjectId: 'my-gcp-project',
  region: 'us-central1',
  configPath: '/path/to/.stacksolo/stacksolo.config.json',
});

// Find project
const project = await registry.findProjectByName('my-app');
const project = await registry.findProjectByPath(configPath);

// Update project status
await registry.updateProject(projectId, { status: 'deployed' });
```

### Resource Operations
```typescript
// Register resources after deploy
await registry.registerResource({
  projectId: project.id,
  type: 'function',
  name: 'api',
  network: 'main',
  resourceType: 'gcp-cdktf:cloud_function',
  config: { runtime: 'nodejs20' },
});

// Update with outputs
await registry.updateResource(resourceId, {
  status: 'ready',
  outputs: { url: 'https://...' },
});

// Find resources
const resources = await registry.findResourcesByProject(projectId);
```

### Cross-Project References
```typescript
import { resolveReference } from '@stacksolo/registry';

// Reference format: @projectName/network/resourceName.output
const url = await resolveReference('@other-project/main/api.url');
```

## Development

```bash
# Build (uses tsc, not tsup)
pnpm --filter @stacksolo/registry build

# Run tests
pnpm --filter @stacksolo/registry test
```

## Coding Practices

### Repository Pattern
Each entity has a repository class:
```typescript
class ProjectRepository {
  async create(input: CreateProjectInput): Promise<RegistryProject>
  async findById(id: string): Promise<RegistryProject | null>
  async findAll(): Promise<RegistryProject[]>
  async update(id: string, input: UpdateProjectInput): Promise<void>
  async delete(id: string): Promise<void>
}
```

### Kysely Conventions
- Use `db` from `db.ts` for all queries
- Table names are snake_case in SQL, camelCase in TypeScript
- Always use parameterized queries (Kysely handles this)

### Adding a New Field
1. Add to schema in `schema.ts`
2. Add to types in `types.ts`
3. Update repository methods
4. Migration: Add column with ALTER TABLE (or recreate for SQLite)

### Status Values
```typescript
type ProjectStatus = 'pending' | 'deploying' | 'deployed' | 'failed' | 'destroyed';
type ResourceStatus = 'pending' | 'creating' | 'ready' | 'failed' | 'destroyed';
type DeploymentStatus = 'pending' | 'running' | 'succeeded' | 'failed';
```
