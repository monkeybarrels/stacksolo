# @stacksolo/runtime

Runtime utilities for StackSolo applications. Provides environment detection, service-to-service calls, and auto-configured GCP SDK clients.

## Installation

```bash
npm install @stacksolo/runtime
```

## Usage

### Environment Detection

```typescript
import { env } from '@stacksolo/runtime';

// Check environment
if (env.isLocal) {
  console.log('Running locally with emulators');
}

if (env.isProduction) {
  console.log('Running in production');
}

// Access environment variables
const projectName = env.projectName;
const gcpProjectId = env.gcpProjectId;

// Get any env var with optional default
const apiKey = env.get('API_KEY', 'default-key');

// Get required env var (throws if missing)
const secret = env.require('SECRET_KEY');
```

### Firestore Client

Auto-connects to the Firestore emulator when `FIRESTORE_EMULATOR_HOST` is set.

```typescript
import { firestore } from '@stacksolo/runtime';

const db = firestore();

// Use Firestore as normal
const doc = await db.collection('users').doc('123').get();
```

### Service-to-Service Calls

Call other services in your stack via the gateway.

```typescript
import { services } from '@stacksolo/runtime';

// Simple call
const response = await services.call('hello', '/greet');

// With options
const response = await services.call('api', '/users', {
  method: 'POST',
  body: { email: 'user@example.com' },
  timeout: 5000,
});

// Typed service client
const api = services.create<MyApiResponse>('api');
const users = await api.get('/users');
const created = await api.post('/users', { name: 'John' });
```

## Environment Variables

The runtime automatically reads these environment variables:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Environment mode (development/production) |
| `GATEWAY_URL` | URL for inter-service calls |
| `STACKSOLO_PROJECT_NAME` | Project name |
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `FIRESTORE_EMULATOR_HOST` | Firestore emulator host |
| `FIREBASE_AUTH_EMULATOR_HOST` | Firebase Auth emulator host |
| `PUBSUB_EMULATOR_HOST` | Pub/Sub emulator host |

When running with `stacksolo dev`, these are automatically injected via Kubernetes ConfigMap.

## Peer Dependencies

The following are optional peer dependencies:

- `firebase-admin` - Required for `firestore()` helper
- `@google-cloud/pubsub` - For Pub/Sub integration
- `@google-cloud/storage` - For Cloud Storage integration

Install only what you need:

```bash
npm install firebase-admin
```

## License

MIT
