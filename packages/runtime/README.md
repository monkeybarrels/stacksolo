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

### Secrets (GCP Secret Manager)

Fetch secrets from GCP Secret Manager in production, with automatic fallback to environment variables in local development.

```typescript
import { getSecret, secrets } from '@stacksolo/runtime';

// Simple usage
const apiKey = await getSecret('api-key');

// With options
const dbPassword = await getSecret('db-password', {
  version: '2',           // Specific version (default: 'latest')
  cacheTtlMs: 60000,      // Cache for 1 minute (default: 5 minutes)
  envVar: 'DB_PASSWORD',  // Check this env var first in local dev
  fallback: 'dev-pass',   // Fallback if secret not found
});

// Required secret (throws if not found)
const jwtSecret = await secrets.require('jwt-secret');

// Batch fetch multiple secrets
const allSecrets = await secrets.getMany(['api-key', 'db-password', 'jwt-secret']);
console.log(allSecrets['api-key']);

// Cache management
secrets.clearCache();              // Clear all cached secrets
secrets.invalidate('api-key');     // Invalidate specific secret
```

**Local Development:**
- Secrets are read from environment variables
- `api-key` maps to `API_KEY` environment variable
- Set secrets in `.env.local` or via `stacksolo dev` ConfigMap

**Production:**
- Secrets are fetched from GCP Secret Manager
- Results are cached for 5 minutes by default
- Requires `@google-cloud/secret-manager` package

### Kernel Client

Interact with the StackSolo kernel for auth validation, file operations, and events.

#### Auth Validation

Validate Firebase ID tokens via the kernel's internal `/auth/validate` endpoint.

```typescript
import { kernel } from '@stacksolo/runtime';

// Validate a token
const result = await kernel.validateToken(req.headers.authorization);
if (result.valid) {
  console.log('User ID:', result.uid);
  console.log('Email:', result.email);
  console.log('Claims:', result.claims);
} else {
  console.log('Invalid:', result.code); // INVALID_TOKEN, TOKEN_EXPIRED, etc.
}

// Express middleware (adds req.user)
app.use('/api', kernel.authMiddleware());

app.get('/api/me', (req, res) => {
  res.json({ uid: req.user.uid, email: req.user.email });
});
```

#### File Operations (via NATS)

Full file management via signed URLs and direct GCS operations.

```typescript
import { kernel } from '@stacksolo/runtime';

// Get signed upload URL
const { uploadUrl, expiresAt } = await kernel.files.getUploadUrl(
  'users/123/avatar.png',
  'image/png'
);
// Client uses uploadUrl to PUT directly to GCS

// Get signed download URL
const { downloadUrl } = await kernel.files.getDownloadUrl('users/123/avatar.png');

// List files in a prefix
const { files, nextPageToken } = await kernel.files.list({
  prefix: 'users/123/',
  maxResults: 50,
});

// Paginate through results
if (nextPageToken) {
  const nextPage = await kernel.files.list({
    prefix: 'users/123/',
    pageToken: nextPageToken,
  });
}

// Delete a file
await kernel.files.delete('users/123/old-avatar.png');

// Move/rename a file
await kernel.files.move(
  'uploads/temp/file.pdf',
  'documents/reports/2024/file.pdf'
);

// Get file metadata
const metadata = await kernel.files.getMetadata('users/123/avatar.png');
console.log('Size:', metadata.size);
console.log('Content-Type:', metadata.contentType);
console.log('Created:', metadata.created);
console.log('Updated:', metadata.updated);
```

#### Events (via NATS JetStream)

Publish and subscribe to events across your services. Events are stored durably in JetStream and delivered reliably.

**Publishing events:**

```typescript
import { kernel } from '@stacksolo/runtime';

// Publish an event (stored in JetStream)
const result = await kernel.events.publish('user.created', {
  userId: '123',
  email: 'user@example.com',
});
console.log('Event sequence:', result.seq);
```

**For Containers (always-on services):**

Use direct NATS subscription when your service maintains a persistent connection:

```typescript
// Direct NATS subscription - containers only
const sub = await kernel.events.subscribe('user.*', (event) => {
  console.log('Event:', event.type, event.data);
});

// Cleanup on shutdown
sub.unsubscribe();
await kernel.closeConnection();
```

**For Functions (serverless):**

Register an HTTP endpoint to receive events. The kernel pushes events to your function:

```typescript
// Register your function's endpoint to receive events
const sub = await kernel.events.registerSubscription({
  pattern: 'user.created',
  endpoint: 'https://my-function.run.app/events',
  serviceName: 'user-notifications',
  maxRetries: 3,        // Retry failed deliveries
  retryDelayMs: 1000,   // Exponential backoff
});

// Your function receives POST requests:
app.post('/events', (req, res) => {
  const event = req.body;
  // event.type = 'user.created'
  // event.data = { userId: '123', ... }
  // event.timestamp = '2024-01-01T00:00:00Z'
  // event.seq = 42

  console.log('Received event:', event.type);
  res.sendStatus(200); // Acknowledge receipt
});

// Unregister when no longer needed
await kernel.events.unregisterSubscription(sub.subscriptionId);

// List active subscriptions
const { subscriptions } = await kernel.events.listSubscriptions();
```

**Event Patterns:**
- `user.created` - Exact match
- `user.*` - Single wildcard (matches `user.created`, `user.updated`)
- `order.>` - Multi-level wildcard (matches `order.item.added`, `order.payment.completed`)

### Plugin Clients

The runtime has a plugin system that lets StackSolo plugins provide their own clients. This means when you install a plugin, you can use its client through the runtime.

#### What is a Plugin Client?

A plugin client is code that a plugin provides to help you interact with its features. For example, a payments plugin might provide a `PaymentsClient` that lets you charge credit cards.

#### Using a Plugin Client

When you install a plugin that provides a runtime client, you can access it like this:

```typescript
import { getPluginClient } from '@stacksolo/runtime';

// Import the plugin to register it (this is required!)
import '@my-org/payments-plugin';

// Get the plugin's client
const payments = await getPluginClient('payments');

// Now use it
await payments.charge({ amount: 1000, currency: 'usd' });
```

**Important:** You must import the plugin package before using `getPluginClient()`. The import registers the plugin with the runtime.

#### Alternative Ways to Access Plugin Clients

```typescript
import { plugins } from '@stacksolo/runtime';
import '@my-org/payments-plugin';

// Using the plugins namespace (same as getPluginClient)
const payments = await plugins.get('payments');

// Check if a plugin is available
if (plugins.has('payments')) {
  const payments = await plugins.get('payments');
}

// See what plugins are registered
console.log(plugins.list()); // ['payments', 'analytics', ...]
```

#### TypeScript: Adding Types

For better autocomplete and type checking, pass the client type as a generic:

```typescript
import { getPluginClient } from '@stacksolo/runtime';
import type { PaymentsClient } from '@my-org/payments-plugin';
import '@my-org/payments-plugin';

// Now `payments` has full type information
const payments = await getPluginClient<PaymentsClient>('payments');
payments.charge({ amount: 1000 }); // TypeScript knows this method exists
```

#### Cleanup on Shutdown

If your app needs to gracefully shut down (close connections, etc.), call `plugins.cleanup()`:

```typescript
import { plugins } from '@stacksolo/runtime';

// When your app is shutting down
process.on('SIGTERM', async () => {
  await plugins.cleanup(); // Tells all plugins to clean up
  process.exit(0);
});
```

#### For Plugin Authors

If you're building a plugin that provides a runtime client, here's how to register it:

```typescript
// In your plugin's main file (e.g., index.ts)
import { registerPlugin } from '@stacksolo/runtime';

// Create your client class
class MyServiceClient {
  constructor(private endpoint: string) {}

  async doSomething() {
    const response = await fetch(`${this.endpoint}/api/something`);
    return response.json();
  }

  close() {
    // Clean up any connections
  }
}

// Register with the runtime
registerPlugin('my-service', {
  // Factory function - called when someone first requests the client
  createClient: (config) => {
    // config.environment is 'development' or 'production'
    const endpoint = config.environment === 'development'
      ? 'http://localhost:3000'
      : process.env.MY_SERVICE_URL || 'https://my-service.example.com';

    return new MyServiceClient(endpoint);
  },

  // Optional: cleanup function called during shutdown
  cleanup: (client) => client.close(),

  // Optional: document what env vars your plugin uses
  envKeys: ['MY_SERVICE_URL'],
});

// Export the client type so users can import it
export type { MyServiceClient };
```

The `createClient` function is only called once, when the client is first requested. After that, the same instance is reused.

## Environment Variables

The runtime automatically reads these environment variables:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Environment mode (development/production) |
| `GATEWAY_URL` | URL for inter-service calls |
| `KERNEL_URL` | Kernel HTTP URL (default: `http://kernel:8090`) |
| `NATS_URL` | Kernel NATS URL (default: `nats://kernel:4222`) |
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
- `@google-cloud/secret-manager` - For `getSecret()` / `secrets` helpers
- `nats` - For kernel NATS features (files, events)

Install only what you need:

```bash
# For Firestore
npm install firebase-admin

# For secrets
npm install @google-cloud/secret-manager

# For kernel NATS features (files, events)
npm install nats
```

## License

MIT
