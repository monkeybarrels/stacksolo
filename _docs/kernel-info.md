## StackSolo Kernel Plugin Specification

### Overview

The kernel plugin (`@stacksolo/plugin-kernel`) provides shared infrastructure services that multiple applications can consume. It follows the "zero business logic" principle - the kernel routes, validates, and stores, but never decides.

### Services

| Service | Purpose | Endpoints | Access |
|---------|---------|-----------|--------|
| **auth** | Validate Firebase tokens, return user claims | `POST /validate` | Public |
| **files** | Generate signed URLs for upload/download | `POST /upload-url`, `POST /download-url` | Internal |
| **events** | Publish events to Pub/Sub | `POST /publish` | Internal |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRODUCTS                                 │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  ClaimReady  │  │  FormReady   │  │   Future     │          │
│  │     API      │  │     API      │  │   Product    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     KERNEL SERVICES                          ││
│  │                                                              ││
│  │   ┌─────────┐      ┌─────────┐      ┌─────────┐            ││
│  │   │  auth   │      │  files  │      │ events  │            ││
│  │   │ (public)│      │(internal)│     │(internal)│            ││
│  │   └────┬────┘      └────┬────┘      └────┬────┘            ││
│  │        │                │                │                  ││
│  └────────┼────────────────┼────────────────┼──────────────────┘│
│           │                │                │                   │
└───────────┼────────────────┼────────────────┼───────────────────┘
            │                │                │
            ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       GCP SERVICES                               │
│                                                                  │
│      Firebase Auth    Cloud Storage         Pub/Sub             │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Structure

```
plugins/kernel/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                 # Plugin definition
│   └── resources/
│       ├── index.ts
│       ├── auth.ts              # kernel:auth resource
│       ├── files.ts             # kernel:files resource
│       └── events.ts            # kernel:events resource
├── functions/
│   ├── auth/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── files/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   └── events/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
├── scripts/
│   └── bundle-functions.ts
└── dist/                        # Build output
    ├── index.js
    ├── index.d.ts
    └── functions/
        ├── auth.zip
        ├── files.zip
        └── events.zip
```

### Resource Definitions

#### kernel:auth

Validates Firebase ID tokens and returns user claims.

**Config Schema:**
```typescript
interface KernelAuthConfig {
  name: string;                    // Resource name
  firebaseProjectId: string;       // Firebase project ID
  public?: boolean;                // Default: true (exposed via load balancer)
}
```

**Outputs:**
```typescript
interface KernelAuthOutputs {
  url: string;                     // Function URL
  name: string;                    // Function name
}
```

**Function API:**
```typescript
// POST /validate
// Request
interface ValidateRequest {
  token: string;                   // Firebase ID token
}

// Response (200)
interface ValidateResponse {
  valid: true;
  uid: string;
  email?: string;
  claims: Record<string, unknown>;
}

// Response (401)
interface ValidateErrorResponse {
  valid: false;
  error: string;
}
```

#### kernel:files

Generates signed URLs for secure file upload/download.

**Config Schema:**
```typescript
interface KernelFilesConfig {
  name: string;                    // Resource name
  bucket: string;                  // Storage bucket name
  maxUploadSize?: string;          // Default: "50MB"
  allowedTypes?: string[];         // Default: ["*/*"]
  urlExpiration?: number;          // Seconds, default: 3600
  allowedCallers?: string[];       // Resource names that can invoke
}
```

**Outputs:**
```typescript
interface KernelFilesOutputs {
  url: string;                     // Function URL
  bucket: string;                  // Bucket name
}
```

**Function API:**
```typescript
// POST /upload-url
// Request
interface UploadUrlRequest {
  filename: string;
  contentType: string;
  metadata?: Record<string, string>;
}

// Response (200)
interface UploadUrlResponse {
  uploadUrl: string;               // Signed PUT URL
  objectPath: string;              // Path in bucket
  expiresAt: string;               // ISO timestamp
}

// POST /download-url
// Request
interface DownloadUrlRequest {
  objectPath: string;
}

// Response (200)
interface DownloadUrlResponse {
  downloadUrl: string;             // Signed GET URL
  expiresAt: string;               // ISO timestamp
}
```

#### kernel:events

Publishes events to Pub/Sub topics.

**Config Schema:**
```typescript
interface KernelEventsConfig {
  name: string;                    // Resource name
  topic: string;                   // Pub/Sub topic name
  allowedCallers?: string[];       // Resource names that can invoke
}
```

**Outputs:**
```typescript
interface KernelEventsOutputs {
  url: string;                     // Function URL
  topic: string;                   // Full topic path
}
```

**Function API:**
```typescript
// POST /publish
// Request
interface PublishRequest {
  eventType: string;               // e.g., "claim.submitted"
  payload: Record<string, unknown>;
  attributes?: Record<string, string>;
}

// Response (200)
interface PublishResponse {
  messageId: string;
  topic: string;
}
```

### Generated CDKTF Code

Each resource generates Cloud Functions Gen2 with appropriate IAM bindings.

**Internal-only pattern:**
```typescript
// NO allUsers binding
// Only specific service accounts can invoke
new Cloudfunctions2FunctionIamMember(this, "invoker", {
  cloudFunction: fn.name,
  role: "roles/cloudfunctions.invoker",
  member: `serviceAccount:${callerServiceAccount.email}`,
});
```

**Public pattern (auth only):**
```typescript
// allUsers can invoke
new Cloudfunctions2FunctionIamMember(this, "invoker", {
  cloudFunction: fn.name,
  role: "roles/cloudfunctions.invoker",
  member: "allUsers",
});
```

### Usage in stacksolo.config.json

```json
{
  "plugins": ["gcp-cdktf", "kernel"],
  
  "project": {
    "id": "my-project",
    "region": "us-central1",
    "buckets": [
      { "name": "uploads" }
    ],
    "topics": [
      { "name": "app-events" }
    ]
  },
  
  "networks": [{
    "name": "main",
    
    "kernel": {
      "auth": {
        "name": "auth",
        "firebaseProjectId": "my-project"
      },
      "files": {
        "name": "files",
        "bucket": "uploads",
        "maxUploadSize": "100MB",
        "allowedCallers": ["api"]
      },
      "events": {
        "name": "events",
        "topic": "app-events",
        "allowedCallers": ["api", "worker"]
      }
    },
    
    "containers": [{
      "name": "api",
      "source": "./services/api",
      "env": {
        "KERNEL_AUTH_URL": "@kernel/auth.url",
        "KERNEL_FILES_URL": "@kernel/files.url",
        "KERNEL_EVENTS_URL": "@kernel/events.url"
      }
    }]
  }]
}
```

### Reference Integration

Add to blueprint resolver's output mappings:

```typescript
const outputMappings = {
  // ... existing
  kernel: {
    default: 'url',
    url: 'url',
    bucket: 'bucket',
    topic: 'topic',
    name: 'name',
  },
};
```

References like `@kernel/files.url` resolve through standard reference system.

### Function Implementation Details

#### auth/src/index.ts

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

export const handler = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const { token } = req.body;
  
  if (!token) {
    res.status(400).json({ valid: false, error: 'Token required' });
    return;
  }
  
  try {
    const decoded = await getAuth().verifyIdToken(token);
    res.json({
      valid: true,
      uid: decoded.uid,
      email: decoded.email,
      claims: decoded,
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Invalid token',
    });
  }
});
```

#### files/src/index.ts

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { Storage } from '@google-cloud/storage';
import { v4 as uuid } from 'uuid';

const storage = new Storage();
const BUCKET = process.env.BUCKET!;
const MAX_UPLOAD_SIZE = process.env.MAX_UPLOAD_SIZE || '50MB';
const URL_EXPIRATION = parseInt(process.env.URL_EXPIRATION || '3600');

export const handler = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const path = req.path;
  
  if (path === '/upload-url') {
    const { filename, contentType, metadata } = req.body;
    
    if (!filename || !contentType) {
      res.status(400).json({ error: 'filename and contentType required' });
      return;
    }
    
    const objectPath = `uploads/${uuid()}/${filename}`;
    const file = storage.bucket(BUCKET).file(objectPath);
    
    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + URL_EXPIRATION * 1000,
      contentType,
    });
    
    res.json({
      uploadUrl,
      objectPath,
      expiresAt: new Date(Date.now() + URL_EXPIRATION * 1000).toISOString(),
    });
    return;
  }
  
  if (path === '/download-url') {
    const { objectPath } = req.body;
    
    if (!objectPath) {
      res.status(400).json({ error: 'objectPath required' });
      return;
    }
    
    const file = storage.bucket(BUCKET).file(objectPath);
    const [exists] = await file.exists();
    
    if (!exists) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    const [downloadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + URL_EXPIRATION * 1000,
    });
    
    res.json({
      downloadUrl,
      expiresAt: new Date(Date.now() + URL_EXPIRATION * 1000).toISOString(),
    });
    return;
  }
  
  res.status(404).json({ error: 'Not found' });
});
```

#### events/src/index.ts

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();
const TOPIC = process.env.TOPIC!;

export const handler = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  const { eventType, payload, attributes } = req.body;
  
  if (!eventType || !payload) {
    res.status(400).json({ error: 'eventType and payload required' });
    return;
  }
  
  const message = {
    json: {
      eventType,
      payload,
      timestamp: new Date().toISOString(),
    },
    attributes: {
      eventType,
      ...attributes,
    },
  };
  
  const messageId = await pubsub.topic(TOPIC).publishMessage(message);
  
  res.json({
    messageId,
    topic: TOPIC,
  });
});
```

### Build Script

```typescript
// scripts/bundle-functions.ts
import { execSync } from 'child_process';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import archiver from 'archiver';

const FUNCTIONS = ['auth', 'files', 'events'];
const DIST_DIR = join(__dirname, '../dist/functions');

async function bundle() {
  // Ensure dist directory exists
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }
  
  for (const fn of FUNCTIONS) {
    const fnDir = join(__dirname, '../functions', fn);
    
    console.log(`Bundling ${fn}...`);
    
    // Install production dependencies
    execSync('npm install --production', { cwd: fnDir });
    
    // Compile TypeScript
    execSync('npx tsc', { cwd: fnDir });
    
    // Create zip
    const zipPath = join(DIST_DIR, `${fn}.zip`);
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.directory(join(fnDir, 'dist'), false);
      archive.directory(join(fnDir, 'node_modules'), 'node_modules');
      archive.file(join(fnDir, 'package.json'), { name: 'package.json' });
      archive.finalize();
    });
    
    console.log(`Created ${zipPath}`);
  }
}

bundle().catch(console.error);
```

### Plugin Entry Point

```typescript
// src/index.ts
import { StackSoloPlugin } from '@stacksolo/core';
import { authResource } from './resources/auth';
import { filesResource } from './resources/files';
import { eventsResource } from './resources/events';
import { join } from 'path';

const plugin: StackSoloPlugin = {
  name: '@stacksolo/plugin-kernel',
  version: '0.1.0',
  
  peerPlugins: ['gcp-cdktf'],
  
  resources: [
    authResource,
    filesResource,
    eventsResource,
  ],
  
  outputs: {
    kernel: {
      default: 'url',
      url: 'url',
      bucket: 'bucket',
      topic: 'topic',
      name: 'name',
    },
  },
  
  getAssetPath: (assetName: string) => {
    return join(__dirname, 'functions', assetName);
  },
};

export default plugin;
```

### Acceptance Criteria

1. **Plugin loads successfully** - `stacksolo plugin list` shows kernel resources
2. **Config validates** - kernel section in config passes schema validation
3. **Code generates** - `stacksolo generate` produces valid CDKTF for all kernel resources
4. **References resolve** - `@kernel/files.url` resolves correctly in dependent resources
5. **Functions deploy** - All three functions deploy to Cloud Functions Gen2
6. **IAM correct** - auth is public, files/events are internal-only
7. **Functions work** - Each endpoint responds correctly to test requests

### Dependencies

**Plugin package.json:**
```json
{
  "name": "@stacksolo/plugin-kernel",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsup && npm run bundle-functions",
    "bundle-functions": "tsx scripts/bundle-functions.ts"
  },
  "peerDependencies": {
    "@stacksolo/core": "^0.1.0"
  },
  "devDependencies": {
    "@stacksolo/core": "workspace:*",
    "archiver": "^6.0.0",
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Function package.json (example for files):**
```json
{
  "name": "kernel-files",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@google-cloud/storage": "^7.0.0",
    "firebase-functions": "^4.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Agent Prompt

```markdown
# Task: Build StackSolo Kernel Plugin

You are building the kernel plugin for StackSolo, an infrastructure deployment tool. The kernel provides shared services (auth, files, events) that multiple applications consume.

## Context

StackSolo uses a plugin system where plugins define resource types and generate CDKTF code. The kernel is a "composite" plugin - it generates Cloud Functions that ship with the plugin as bundled zip files.

## Your Goal

Create the `plugins/kernel/` directory with a fully functional plugin that:

1. Defines three resource types: `kernel:auth`, `kernel:files`, `kernel:events`
2. Generates CDKTF code for Cloud Functions Gen2
3. Bundles the actual function code as zips
4. Integrates with the existing reference system (`@kernel/files.url`)

## Key Files to Create

```
plugins/kernel/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts                 # Plugin definition
│   └── resources/
│       ├── index.ts
│       ├── auth.ts              # kernel:auth resource
│       ├── files.ts             # kernel:files resource
│       └── events.ts            # kernel:events resource
├── functions/
│   ├── auth/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── files/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   └── events/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
└── scripts/
    └── bundle-functions.ts
```

## Critical Requirements

1. **Internal-only services**: `files` and `events` must NOT have `allUsers` IAM binding. Only `allowedCallers` service accounts can invoke them.

2. **Public auth service**: `auth` should have `allUsers` IAM binding (or be exposed via load balancer).

3. **Reference system integration**: The plugin must export `outputs` mapping so `@kernel/files.url` works.

4. **Function bundling**: The build script must zip each function with its dependencies.

## Reference Existing Code

Look at `plugins/gcp-cdktf/` to understand:
- How resources are structured
- How CDKTF code is generated
- The `ResourceType` interface

Look at `packages/blueprint/src/references.ts` to understand:
- How `@type/name.property` references work
- The `outputMappings` structure

## Validation

After building, verify:
1. `pnpm build` succeeds in plugins/kernel
2. dist/functions/ contains auth.zip, files.zip, events.zip
3. The plugin exports match `StackSoloPlugin` interface
4. Generated CDKTF code is valid

## Start Here

1. Read `plugins/gcp-cdktf/src/index.ts` to understand plugin structure
2. Read `packages/blueprint/src/references.ts` to understand output mappings
3. Create the plugin structure
4. Implement `kernel:files` first as it's the simplest
5. Add `kernel:events` (similar pattern, different GCP service)
6. Add `kernel:auth` (Firebase-specific)
7. Create the bundle script
8. Test the build
```

---

Want me to adjust anything in the spec or prompt?