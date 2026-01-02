# @stacksolo/runtime

Runtime utilities for applications deployed with StackSolo. Published to npm as `@stacksolo/runtime`.

## Purpose

This package provides:
- Environment detection (local vs production)
- Auto-configured GCP SDK clients
- Service-to-service communication

## Architecture

```
src/
├── env.ts        # Environment detection and variables
├── firestore.ts  # Auto-configured Firestore client
├── services.ts   # Inter-service HTTP calls
├── storage.ts    # Cloud Storage helpers
├── secrets.ts    # GCP Secret Manager client
├── kernel.ts     # Kernel client (auth + files + events)
├── plugins.ts    # Plugin registration system
├── config.ts     # Config loading utilities
├── validation.ts # Runtime validation helpers
└── index.ts      # Public exports
```

## Usage

### Environment Detection
```typescript
import { env } from '@stacksolo/runtime';

if (env.isLocal) {
  console.log('Running with emulators');
}

if (env.isProduction) {
  console.log('Running in GCP');
}

// Access env vars with defaults
const apiKey = env.get('API_KEY', 'default');

// Require env var (throws if missing)
const secret = env.require('SECRET_KEY');
```

### Firestore Client
```typescript
import { firestore } from '@stacksolo/runtime';

// Auto-connects to emulator when FIRESTORE_EMULATOR_HOST is set
const db = firestore();
const doc = await db.collection('users').doc('123').get();
```

### Service-to-Service Calls
```typescript
import { services } from '@stacksolo/runtime';

// Call another service via the gateway
const response = await services.call('api', '/users');

// With options
const response = await services.call('api', '/users', {
  method: 'POST',
  body: { name: 'John' },
});

// Typed client
const api = services.create<MyApiResponse>('api');
const users = await api.get('/users');
```

### Plugin System
Plugins can register their own clients with the runtime:

```typescript
// In your plugin package (e.g., @my-org/payments-plugin)
import { registerPlugin } from '@stacksolo/runtime';
import { PaymentsClient } from './client';

registerPlugin('payments', {
  createClient: (config) => {
    const endpoint = config.environment === 'development'
      ? 'http://localhost:4000'
      : process.env.PAYMENTS_URL;
    return new PaymentsClient({ endpoint });
  },
  cleanup: (client) => client.close(),
  envKeys: ['PAYMENTS_URL'],
});
```

```typescript
// In user application code
import { plugins, getPluginClient } from '@stacksolo/runtime';
import '@my-org/payments-plugin'; // Side-effect import registers the plugin

// Async access (creates client on first call)
const payments = await getPluginClient<PaymentsClient>('payments');
await payments.charge({ amount: 1000 });

// Or use the plugins namespace
const payments = await plugins.get<PaymentsClient>('payments');

// Sync access (must be initialized first)
const payments = plugins.getSync<PaymentsClient>('payments');

// Cleanup on shutdown
await plugins.cleanup();
```

## Environment Variables

The runtime reads these env vars (injected by StackSolo):

| Variable | Local (K8s) | Production (GCP) |
|----------|-------------|------------------|
| `NODE_ENV` | `development` | `production` |
| `GATEWAY_URL` | `http://gateway:8000` | Load balancer URL |
| `STACKSOLO_PROJECT_NAME` | Project name | Project name |
| `GCP_PROJECT_ID` | `demo-{project}` | Actual GCP project |
| `FIRESTORE_EMULATOR_HOST` | `firebase-emulator:8080` | Not set |
| `FIREBASE_AUTH_EMULATOR_HOST` | `firebase-emulator:9099` | Not set |
| `PUBSUB_EMULATOR_HOST` | `pubsub-emulator:8085` | Not set |

## Development

```bash
# Build
pnpm --filter @stacksolo/runtime build

# Publish to npm (auto on push to main)
# Version bump in package.json triggers publish
```

## Coding Practices

### Peer Dependencies
Heavy dependencies are peer deps to avoid bloating user bundles:
```json
{
  "peerDependencies": {
    "firebase-admin": "^12.0.0 || ^13.0.0",
    "@google-cloud/pubsub": "^4.0.0",
    "@google-cloud/storage": "^7.0.0"
  }
}
```

### Lazy Initialization
SDK clients are initialized lazily on first use:
```typescript
let _db: Firestore | null = null;

export function firestore(): Firestore {
  if (!_db) {
    _db = initializeFirestore();
  }
  return _db;
}
```

### Environment Fallbacks
Always provide sensible defaults for local development:
```typescript
get gatewayUrl(): string {
  return process.env.GATEWAY_URL || 'http://gateway:8000';
}
```

### Adding a New SDK Client
1. Add peer dependency to `package.json`
2. Create file in `src/` (e.g., `pubsub.ts`)
3. Use lazy initialization pattern
4. Export from `index.ts`
5. Add to README.md

### Plugin Runtime Integration
Plugins that provide runtime clients should:
1. Import `registerPlugin` from `@stacksolo/runtime`
2. Call `registerPlugin()` at module load time (side-effect)
3. Provide a factory function that creates the client
4. Optionally provide a cleanup function for graceful shutdown
5. Document required environment variables via `envKeys`

The plugin system uses lazy initialization - clients are only created when first accessed via `getPluginClient()`.

### Publishing
The package auto-publishes to npm when:
1. Changes are pushed to `packages/runtime/**` on `main`
2. Workflow: `.github/workflows/publish-runtime.yml`

To publish a new version:
1. Bump version in `package.json`
2. Commit and push to `main`
