# StackSolo - Project Specification Prompt

Use this prompt when starting a new conversation with an AI assistant about StackSolo.

---

## Project Overview

I'm building **StackSolo**, a local webapp that helps solo developers scaffold and deploy cloud infrastructure using Pulumi. It's an open source project under my company MonkeyBarrels (monkeybarrels.com).

**Domain:** stacksolo.dev

## The Problem

Solo developers and indie hackers often know how to code but struggle with cloud infrastructure. They face a choice between:
- Managed platforms (Vercel, Railway) that hide complexity but limit control
- Raw cloud providers (AWS, GCP) that offer flexibility but require ops knowledge

StackSolo sits in between - opinionated enough to be simple, but transparent enough to be understood and modified.

## The Solution

A local webapp where users:
1. Create a project and select a cloud provider
2. Add resources through a visual UI
3. See generated Pulumi TypeScript code
4. Deploy with one click (or export and run themselves)

**Key principle:** You own the code. You can eject anytime. This is not a managed platform.

## Tech Stack

- **Frontend:** SvelteKit
- **Backend:** Express + tRPC
- **Database:** SQLite + Kysely (repository pattern for future Postgres)
- **IaC:** Pulumi Automation API
- **Monorepo:** pnpm workspaces
- **Language:** TypeScript throughout

## Architecture

### Plugin System

Providers (GCP, AWS, Railway) and resource types (S3 bucket, Lambda, etc.) are defined as plugins.

```typescript
// Provider definition
defineProvider({
  id: 'gcp',
  name: 'Google Cloud Platform',
  auth: {
    type: 'cli',
    command: 'gcloud',
    validate: async () => { /* check if authed */ },
    instructions: 'Run `gcloud auth application-default login`'
  },
  resources: [storageBucket, cloudFunction, cloudRun]
})

// Resource type definition
defineResource({
  id: 'gcp:storage_bucket',
  provider: 'gcp',
  name: 'Cloud Storage Bucket',
  description: 'Object storage for files and data',
  configSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Bucket Name' },
      location: { type: 'string', title: 'Location', default: 'US' },
      storageClass: { 
        type: 'string', 
        title: 'Storage Class',
        enum: ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'],
        default: 'STANDARD'
      }
    },
    required: ['name']
  },
  defaultConfig: { location: 'US', storageClass: 'STANDARD' },
  generatePulumi: (config) => ({
    imports: ["import * as gcp from '@pulumi/gcp'"],
    code: `
const ${config.name}Bucket = new gcp.storage.Bucket("${config.name}", {
  location: "${config.location}",
  storageClass: "${config.storageClass}",
});`,
    outputs: [`${config.name}Bucket.url`]
  })
})
```

### Plugin Discovery (Hybrid)

1. Auto-discover installed packages: `@stacksolo/plugin-*`, `stacksolo-plugin-*`
2. Local plugins: `./stacksolo-plugins/` or `~/.stacksolo/plugins/`
3. Config overrides: `stacksolo.config.ts`

### Repository Pattern

Database access uses interfaces for portability:

```typescript
interface ProjectRepository {
  create(data: CreateProjectInput): Promise<Project>
  findById(id: string): Promise<Project | null>
  findAll(): Promise<Project[]>
  update(id: string, data: UpdateProjectInput): Promise<Project>
  delete(id: string): Promise<void>
}

// SQLite implementation now
class SQLiteProjectRepository implements ProjectRepository { ... }

// Postgres implementation later (for hosted version)
class PostgresProjectRepository implements ProjectRepository { ... }
```

### Database Schema

```typescript
interface Database {
  projects: {
    id: string
    name: string
    provider: string           // 'gcp', 'aws', etc.
    provider_config: string    // JSON - provider-specific (project ID, region, etc.)
    created_at: string
    updated_at: string
  }
  resources: {
    id: string
    project_id: string
    type: string               // 'gcp:storage_bucket', 'aws:s3_bucket'
    name: string
    config: string             // JSON - resource configuration
    created_at: string
    updated_at: string
  }
  deployments: {
    id: string
    project_id: string
    status: 'pending' | 'running' | 'succeeded' | 'failed'
    started_at: string
    finished_at: string | null
    logs: string | null
    error: string | null
  }
}
```

### Core Interfaces

```typescript
interface Provider {
  id: string
  name: string
  icon: string
  auth: AuthMethod
  resources: ResourceType[]
}

interface AuthMethod {
  type: 'cli' | 'service_account' | 'api_key' | 'oauth'
  command?: string
  instructions: string
  validate: () => Promise<boolean>
}

interface ResourceType {
  id: string
  provider: string
  name: string
  description: string
  icon: string
  configSchema: JSONSchema
  defaultConfig: Record<string, any>
  generatePulumi: (config: ResourceConfig) => PulumiCode
  estimateCost?: (config: ResourceConfig) => CostEstimate
}

interface PulumiCode {
  imports: string[]
  code: string
  outputs?: string[]
}
```

## Project Structure

```
stacksolo/
├── packages/
│   ├── api/                 # Express + tRPC backend
│   │   ├── src/
│   │   │   ├── db/          # Kysely schema, migrations
│   │   │   ├── repositories/# Data access layer
│   │   │   ├── services/    # Business logic
│   │   │   ├── routes/      # tRPC routers
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── web/                 # SvelteKit frontend
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   └── app.html
│   │   └── package.json
│   │
│   ├── shared/              # Shared types
│   │   └── src/types.ts
│   │
│   ├── core/                # Plugin system
│   │   ├── src/
│   │   │   ├── types.ts
│   │   │   ├── registry.ts
│   │   │   ├── define.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── cli/                 # CLI entry point (future)
│
├── plugins/
│   └── gcp/                 # Built-in GCP plugin
│       ├── src/
│       │   ├── provider.ts
│       │   ├── resources/
│       │   │   ├── storage-bucket.ts
│       │   │   └── index.ts
│       │   └── index.ts
│       └── package.json
│
├── stacksolo.config.ts
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## v0.1 Scope

Minimum viable version:

1. **Core package** - Plugin interfaces and registry
2. **GCP plugin** - Storage Bucket resource only
3. **API** - Project/Resource CRUD, deploy endpoint
4. **Database** - SQLite with projects, resources, deployments tables
5. **Web UI** - Create project, add bucket, view code, deploy

**User flow:**
1. Start StackSolo locally
2. Create a new project (name, GCP project ID, region)
3. Add a Storage Bucket resource (configure via form)
4. Preview generated Pulumi code
5. Click deploy → bucket exists in GCP

**Prerequisites for users:**
- Node.js 18+
- Pulumi CLI installed
- gcloud CLI installed and authenticated

**NOT in v0.1:**
- Multiple resource types
- Other providers (AWS, Azure, etc.)
- stacksolo.config.ts support
- Local/custom plugins
- npx installer

## Future Roadmap

### Providers
- AWS (S3, Lambda, API Gateway, DynamoDB, etc.)
- Azure (Blob Storage, Functions, etc.)
- DigitalOcean
- Railway, Render, Fly.io
- Supabase, PlanetScale, Neon

### Features
- Multiple resource types per provider
- Resource dependencies/references
- Stack templates ("SaaS Starter", "API Backend")
- Cost estimation
- Import existing infrastructure
- Hosted version (multi-tenant, user accounts)

## Code Conventions

- TypeScript strict mode
- Repository pattern for data access
- tRPC for type-safe API
- Conventional commits
- Resource IDs: `provider:resource_name` format
- Config schemas: JSON Schema format

---

## Working With Me

When helping with this project:

1. **Stay focused on v0.1 scope** - Don't over-engineer for future features
2. **Use the patterns defined** - Repository pattern, defineProvider/defineResource
3. **Keep it simple** - This is for solo devs who want simplicity
4. **Code should be exportable** - Users own what's generated

Ask me if you need clarification on any architectural decisions.
