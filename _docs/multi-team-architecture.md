# Multi-Team Resource Sharing Architecture

## Problem Statement

Currently, each StackSolo project creates its own isolated VPC and resources. Companies with multiple teams need to:
1. Share databases between teams
2. Connect to a central/shared VPC
3. Reference externally-managed resources (not in StackSolo config)

## Current Architecture

```
Team A (stacksolo.config.json)     Team B (stacksolo.config.json)
├── VPC: main                       ├── VPC: main
├── Database: users-db              ├── Database: orders-db  ← DUPLICATED!
└── Container: api                  └── Container: api
    (cannot access Team B)              (cannot access Team A)
```

**Limitations:**
- Each config = 1 GCP project = isolated networks
- `@database/name` references only work within same config
- No cross-project references or VPC peering

## Proposed Solution: External Resources

Add ability to reference resources managed outside this config:

```json
{
  "project": {
    "name": "team-b-api",
    "gcpProjectId": "team-b-project",
    "external": {
      "databases": [{
        "name": "shared-users-db",
        "projectId": "shared-infra-project",
        "instanceName": "users-db-instance"
      }],
      "networks": [{
        "name": "shared-vpc",
        "projectId": "shared-infra-project",
        "networkName": "company-vpc"
      }]
    },
    "networks": [{
      "name": "main",
      "useSharedVpc": "shared-vpc",
      "containers": [{
        "name": "api",
        "env": {
          "DATABASE_URL": "@external/shared-users-db.connectionString"
        }
      }]
    }]
  }
}
```

## VPC Peering & IAM

**How cross-project sharing works in GCP:**

```
Team A VPC  ←──VPC Peering──→  Shared VPC (company-shared project)
    │                              │
    └── Container                  └── Cloud SQL Database
         reaches DB via private IP
```

**Required GCP resources:**
1. **VPC Peering** - Private network connection between VPCs
2. **IAM Bindings** - Service account permissions

**Pulumi code (what StackSolo would generate):**

```typescript
// VPC Peering from Team A to Shared VPC
const peering = new gcp.compute.NetworkPeering("team-a-to-shared", {
  network: teamAVpc.selfLink,
  peerNetwork: "projects/shared-project/global/networks/shared-vpc",
});

// IAM binding for database access
const dbAccess = new gcp.projects.IAMMember("team-a-db-access", {
  project: "shared-project",
  role: "roles/cloudsql.client",
  member: `serviceAccount:${teamAServiceAccount.email}`,
});

// Network user access for VPC peering
const networkAccess = new gcp.projects.IAMMember("team-a-network-access", {
  project: "shared-project",
  role: "roles/compute.networkUser",
  member: `serviceAccount:${teamAServiceAccount.email}`,
});
```

## IAM Roles Reference

| Shared Resource | Required Role |
|-----------------|---------------|
| Cloud SQL | `roles/cloudsql.client` |
| VPC Network | `roles/compute.networkUser` |
| Cloud Storage | `roles/storage.objectViewer` |
| Secret Manager | `roles/secretmanager.secretAccessor` |
| Pub/Sub | `roles/pubsub.subscriber` |

## Implementation Plan

### Phase 1: Schema Changes
**File:** `packages/blueprint/src/schema.ts`

```typescript
export interface ExternalDatabaseRef {
  name: string;              // Local reference name
  projectId: string;         // GCP project containing the DB
  instanceName: string;      // Cloud SQL instance name
  databaseName?: string;
  region?: string;
}

export interface ExternalNetworkRef {
  name: string;
  projectId: string;
  networkName: string;
}

export interface ExternalConfig {
  databases?: ExternalDatabaseRef[];
  networks?: ExternalNetworkRef[];
  secrets?: ExternalSecretRef[];
  buckets?: ExternalBucketRef[];
}

// Add to ProjectConfig:
export interface ProjectConfig {
  // ... existing ...
  external?: ExternalConfig;
}

// Add to NetworkConfig:
export interface NetworkConfig {
  // ... existing ...
  useSharedVpc?: string;  // Reference to external network
}
```

### Phase 2: Reference System
**File:** `packages/blueprint/src/references.ts`

Extend to support `@external/name.property`:

```typescript
export function parseReference(ref: string): Reference | null {
  if (ref.startsWith('@external/')) {
    const rest = ref.slice(10);
    const [name, property] = rest.split('.');
    return { type: 'external', name, property };
  }
  // ... existing logic
}
```

### Phase 3: Resolver Updates
**File:** `packages/blueprint/src/resolver.ts`

```typescript
function resolveExternalResources(config: StackSoloConfig): ResolvedResource[] {
  const resources: ResolvedResource[] = [];
  const ext = config.project.external;

  if (ext?.databases) {
    for (const db of ext.databases) {
      resources.push({
        id: `external-database-${db.name}`,
        type: 'gcp:external_cloud_sql',
        name: db.name,
        config: { projectId: db.projectId, instanceName: db.instanceName },
        dependsOn: [],
        isExternal: true,
      });
    }
  }
  return resources;
}
```

### Phase 4: Generator Updates
**File:** `packages/blueprint/src/generator.ts`

Generate Pulumi lookups for external resources:

```typescript
// For external databases:
const externalDb = gcp.sql.DatabaseInstance.get(
  "shared-users-db",
  "projects/shared-infra-project/instances/users-db-instance"
);
```

### Phase 5: Validation
**File:** `packages/blueprint/src/parser.ts`

- External references must exist in `external` config
- `useSharedVpc` must reference valid external network
- No circular dependencies

## Files to Modify

1. `packages/blueprint/src/schema.ts` - Add ExternalConfig types
2. `packages/blueprint/src/references.ts` - Support @external/ syntax
3. `packages/blueprint/src/resolver.ts` - Resolve external resources
4. `packages/blueprint/src/generator.ts` - Generate Pulumi lookups
5. `packages/blueprint/src/parser.ts` - Validate external references
6. `packages/blueprint/src/__tests__/` - Tests

## Example: Shared Database Scenario

**Shared Infrastructure (deployed separately):**

```json
{
  "project": {
    "name": "shared-infra",
    "gcpProjectId": "company-shared",
    "networks": [{
      "name": "company-vpc",
      "databases": [{
        "name": "users-db",
        "databaseVersion": "POSTGRES_15"
      }]
    }]
  }
}
```

**Team A (references shared resources):**

```json
{
  "project": {
    "name": "team-a-api",
    "gcpProjectId": "team-a",
    "external": {
      "databases": [{
        "name": "users",
        "projectId": "company-shared",
        "instanceName": "users-db"
      }]
    },
    "networks": [{
      "name": "main",
      "containers": [{
        "name": "api",
        "env": {
          "DATABASE_URL": "@external/users.connectionString"
        }
      }]
    }]
  }
}
```

## Status

- **Not yet implemented** - This document captures the future architecture
- Current StackSolo supports single-project isolated deployments
- Multi-team sharing is planned for a future release
