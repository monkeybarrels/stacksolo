# @stacksolo/plugin-kernel

A shared infrastructure service for StackSolo apps that handles authentication, file uploads, and events.

## What is the Kernel?

Think of the kernel as a "utility service" that your apps can share. Instead of each app implementing its own auth validation, file upload logic, and event system, they all use the kernel.

**The kernel provides three things:**

1. **Auth** - Validates Firebase tokens (so you know who's logged in)
2. **Files** - Generates secure upload/download URLs for Google Cloud Storage
3. **Events** - A message queue for apps to communicate with each other

---

## Quick Start

### Step 1: Add kernel to your config

In your `stacksolo.config.json`:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-gcp-project",
    "region": "us-central1",

    "buckets": [
      { "name": "uploads" }
    ],

    "kernel": {
      "name": "main",
      "firebaseProjectId": "my-gcp-project",
      "storageBucket": "uploads"
    },

    "networks": [{
      "name": "default",
      "containers": [{
        "name": "api",
        "env": {
          "KERNEL_AUTH_URL": "@kernel/main.authUrl",
          "NATS_URL": "@kernel/main.natsUrl"
        }
      }]
    }]
  }
}
```

### Step 2: Deploy

```bash
stacksolo deploy
```

### Step 3: Use in your code

```typescript
// Validate a user's token
const response = await fetch(`${process.env.KERNEL_AUTH_URL}/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: userFirebaseToken }),
});

const { valid, uid, email } = await response.json();

if (valid) {
  console.log(`User ${uid} is logged in!`);
}
```

---

## Configuration Reference

Add this to your `stacksolo.config.json` under `project`:

```json
{
  "kernel": {
    "name": "main",
    "firebaseProjectId": "your-firebase-project-id",
    "storageBucket": "your-gcs-bucket-name"
  }
}
```

### Required Fields

| Field | What it does | Example |
|-------|--------------|---------|
| `firebaseProjectId` | The Firebase project used for user authentication | `"my-app-prod"` |
| `storageBucket` | The GCS bucket for file uploads/downloads | `"my-app-uploads"` |

### Optional Fields

| Field | Default | What it does |
|-------|---------|--------------|
| `name` | `"kernel"` | Name used in references like `@kernel/main` |
| `location` | Project region | GCP region to deploy to |
| `memory` | `"512Mi"` | Memory for the service (`"256Mi"`, `"512Mi"`, `"1Gi"`, `"2Gi"`) |
| `cpu` | `1` | CPU cores for the service |

---

## How to Reference the Kernel

In your container or function config, use these references to get the kernel URLs:

| Reference | What you get | Example value |
|-----------|--------------|---------------|
| `@kernel/main.authUrl` | URL for auth validation | `https://main-abc123.run.app/auth` |
| `@kernel/main.natsUrl` | URL for NATS messaging | `nats://main-abc123.run.app:4222` |
| `@kernel/main.url` | Base URL of the kernel | `https://main-abc123.run.app` |

**Example:**

```json
{
  "containers": [{
    "name": "api",
    "env": {
      "KERNEL_AUTH_URL": "@kernel/main.authUrl",
      "NATS_URL": "@kernel/main.natsUrl"
    }
  }]
}
```

After deployment, your container will have:
- `KERNEL_AUTH_URL=https://main-abc123.run.app/auth`
- `NATS_URL=nats://main-abc123.run.app:4222`

---

## Using the Auth Service

The auth service validates Firebase ID tokens. This is how you check if a user is logged in.

### When to use it

- When a user makes an API request, validate their token before processing
- When you need to know who the user is (get their user ID, email, etc.)

### How it works

1. User logs in with Firebase in your frontend
2. User sends their Firebase token to your API
3. Your API sends the token to the kernel for validation
4. Kernel tells you if the token is valid and who the user is

### Code Example: Express Middleware

```typescript
// middleware/auth.ts

import express from 'express';

// This middleware checks if the user is logged in
export async function requireAuth(req, res, next) {
  // Step 1: Get the token from the Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Step 2: Send the token to the kernel for validation
  try {
    const response = await fetch(`${process.env.KERNEL_AUTH_URL}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    // Step 3: Check if the token is valid
    if (!data.valid) {
      return res.status(401).json({ error: data.error });
    }

    // Step 4: Add user info to the request so your routes can use it
    req.user = {
      uid: data.uid,
      email: data.email,
    };

    next();
  } catch (error) {
    console.error('Auth validation failed:', error);
    return res.status(500).json({ error: 'Auth service unavailable' });
  }
}
```

**Using the middleware:**

```typescript
import express from 'express';
import { requireAuth } from './middleware/auth';

const app = express();

// This route requires the user to be logged in
app.get('/api/profile', requireAuth, (req, res) => {
  res.json({
    message: 'You are logged in!',
    userId: req.user.uid,
    email: req.user.email,
  });
});

// This route is public (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

### Auth API Reference

**Endpoint:** `POST /auth/validate`

**Request:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6..."
}
```

**Success Response (200):**
```json
{
  "valid": true,
  "uid": "abc123",
  "email": "user@example.com",
  "claims": { ... }
}
```

**Error Response (401):**
```json
{
  "valid": false,
  "error": "Token has expired",
  "code": "TOKEN_EXPIRED"
}
```

**Error Codes:**

| Code | What it means | What to do |
|------|---------------|------------|
| `MISSING_TOKEN` | No token was sent | Make sure to include `{ "token": "..." }` in the request body |
| `INVALID_TOKEN` | Token signature is wrong | User needs to log in again |
| `TOKEN_EXPIRED` | Token is too old | Refresh the token using Firebase SDK |
| `TOKEN_REVOKED` | Token was revoked | User needs to log in again |

---

## Using the Files Service

The files service generates signed URLs for uploading and downloading files from Google Cloud Storage.

### What is a signed URL?

A signed URL is a temporary link that lets someone upload or download a file directly to/from GCS. The URL expires after a set time (default: 1 hour).

### When to use it

- Let users upload files (images, documents, etc.)
- Let users download private files
- Avoid routing large files through your server

### How it works

1. Your backend asks the kernel for a signed URL
2. Kernel generates the URL and returns it
3. Your backend gives the URL to the frontend
4. Frontend uploads/downloads directly to GCS (not through your server)

### Code Example: File Upload

**Backend (Express):**

```typescript
import express from 'express';
import { connect, StringCodec } from 'nats';

const app = express();

// Connect to NATS when server starts
let nats;
const sc = StringCodec();

async function connectNats() {
  nats = await connect({ servers: process.env.NATS_URL });
  console.log('Connected to NATS');
}

connectNats();

// Endpoint to get an upload URL
app.post('/api/files/upload-url', requireAuth, async (req, res) => {
  const { filename, contentType } = req.body;

  // Create a unique path for this file
  const path = `users/${req.user.uid}/uploads/${Date.now()}-${filename}`;

  // Ask the kernel for a signed upload URL
  const response = await nats.request(
    'kernel.files.upload-url',
    sc.encode(JSON.stringify({ path, contentType })),
    { timeout: 5000 }
  );

  const result = JSON.parse(sc.decode(response.data));

  res.json({
    uploadUrl: result.uploadUrl,
    path: result.path,
    expiresAt: result.expiresAt,
  });
});
```

**Frontend (React):**

```typescript
async function uploadFile(file: File, firebaseToken: string) {
  // Step 1: Get a signed upload URL from your backend
  const urlResponse = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firebaseToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
    }),
  });

  const { uploadUrl, path } = await urlResponse.json();

  // Step 2: Upload the file directly to GCS
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  console.log('File uploaded to:', path);
  return path;
}
```

### Code Example: File Download

**Backend:**

```typescript
app.get('/api/files/download-url', requireAuth, async (req, res) => {
  const { path } = req.query;

  // Ask the kernel for a signed download URL
  const response = await nats.request(
    'kernel.files.download-url',
    sc.encode(JSON.stringify({ path })),
    { timeout: 5000 }
  );

  const result = JSON.parse(sc.decode(response.data));

  if (result.error) {
    return res.status(404).json({ error: result.error });
  }

  res.json({
    downloadUrl: result.downloadUrl,
    expiresAt: result.expiresAt,
  });
});
```

**Frontend:**

```typescript
async function downloadFile(path: string, firebaseToken: string) {
  // Get the download URL
  const response = await fetch(`/api/files/download-url?path=${encodeURIComponent(path)}`, {
    headers: { 'Authorization': `Bearer ${firebaseToken}` },
  });

  const { downloadUrl } = await response.json();

  // Open the download URL (or use it in an <img> tag, etc.)
  window.open(downloadUrl);
}
```

### Files API Reference (NATS)

**Subject:** `kernel.files.upload-url`

Request:
```json
{
  "path": "users/123/uploads/photo.jpg",
  "contentType": "image/jpeg"
}
```

Response:
```json
{
  "uploadUrl": "https://storage.googleapis.com/...",
  "path": "users/123/uploads/photo.jpg",
  "expiresAt": "2024-01-01T12:00:00.000Z"
}
```

**Subject:** `kernel.files.download-url`

Request:
```json
{
  "path": "users/123/uploads/photo.jpg"
}
```

Response:
```json
{
  "downloadUrl": "https://storage.googleapis.com/...",
  "path": "users/123/uploads/photo.jpg",
  "expiresAt": "2024-01-01T12:00:00.000Z"
}
```

---

## Using the Events Service

The events service lets your apps send messages to each other using NATS JetStream.

### What is it good for?

- **Background jobs:** API sends "process this" message, worker picks it up
- **Notifications:** When something happens, other services can react
- **Audit logs:** All events are stored for 7 days

### How it works

1. One service publishes an event (e.g., "user signed up")
2. Other services subscribe to that event type
3. When the event is published, all subscribers receive it
4. Events are stored in JetStream for 7 days (you can replay them)

### Code Example: Publishing Events

```typescript
import { connect, StringCodec } from 'nats';

const nats = await connect({ servers: process.env.NATS_URL });
const sc = StringCodec();

// Publish an event when a user signs up
function publishUserSignedUp(userId: string, email: string) {
  nats.publish(
    'kernel.events.user.signed-up',
    sc.encode(JSON.stringify({
      userId,
      email,
      timestamp: new Date().toISOString(),
    }))
  );
}

// Use it in your signup handler
app.post('/api/signup', async (req, res) => {
  // ... create user in database ...

  // Publish event (other services will receive this)
  publishUserSignedUp(user.id, user.email);

  res.json({ success: true });
});
```

### Code Example: Subscribing to Events

```typescript
import { connect, StringCodec } from 'nats';

const nats = await connect({ servers: process.env.NATS_URL });
const sc = StringCodec();

// Get JetStream context
const js = nats.jetstream();

async function startEventListener() {
  // Create a consumer for your service
  const consumer = await js.consumers.get('KERNEL_EVENTS', 'my-worker');

  // Process events as they come in
  for await (const msg of await consumer.consume()) {
    const event = JSON.parse(sc.decode(msg.data));

    console.log('Received event:', msg.subject, event);

    // Handle different event types
    if (msg.subject === 'kernel.events.user.signed-up') {
      // Send welcome email, create profile, etc.
      await sendWelcomeEmail(event.email);
    }

    // Acknowledge the message (removes it from the queue)
    msg.ack();
  }
}

startEventListener();
```

### Event Naming Convention

Use dots to namespace your events:

```
kernel.events.{domain}.{action}

Examples:
- kernel.events.user.signed-up
- kernel.events.user.deleted
- kernel.events.order.created
- kernel.events.order.paid
- kernel.events.file.uploaded
```

---

## Complete Example Configs

### API + Worker

A typical setup with an API server and a background worker:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-app-prod",
    "region": "us-central1",

    "buckets": [
      { "name": "uploads" }
    ],

    "kernel": {
      "name": "main",
      "firebaseProjectId": "my-app-prod",
      "storageBucket": "uploads"
    },

    "networks": [{
      "name": "default",
      "containers": [
        {
          "name": "api",
          "image": "gcr.io/my-app-prod/api:latest",
          "allowUnauthenticated": true,
          "env": {
            "NODE_ENV": "production",
            "KERNEL_AUTH_URL": "@kernel/main.authUrl",
            "NATS_URL": "@kernel/main.natsUrl"
          }
        },
        {
          "name": "worker",
          "image": "gcr.io/my-app-prod/worker:latest",
          "minInstances": 1,
          "env": {
            "NODE_ENV": "production",
            "NATS_URL": "@kernel/main.natsUrl"
          }
        }
      ]
    }]
  }
}
```

### Serverless Functions

Using Cloud Functions instead of containers:

```json
{
  "project": {
    "name": "my-app",
    "gcpProjectId": "my-app-prod",
    "region": "us-central1",

    "buckets": [
      { "name": "uploads" }
    ],

    "kernel": {
      "name": "main",
      "firebaseProjectId": "my-app-prod",
      "storageBucket": "uploads"
    },

    "networks": [{
      "name": "default",
      "functions": [
        {
          "name": "api",
          "runtime": "nodejs20",
          "entryPoint": "api",
          "allowUnauthenticated": true,
          "env": {
            "KERNEL_AUTH_URL": "@kernel/main.authUrl",
            "NATS_URL": "@kernel/main.natsUrl"
          }
        },
        {
          "name": "process-uploads",
          "runtime": "nodejs20",
          "entryPoint": "processUploads",
          "trigger": {
            "type": "storage",
            "bucket": "uploads",
            "event": "finalize"
          },
          "env": {
            "NATS_URL": "@kernel/main.natsUrl"
          }
        }
      ]
    }]
  }
}
```

---

## Local Development

### Running the kernel locally

```bash
# Go to the service directory
cd plugins/kernel/service

# Install dependencies
npm install

# Build the TypeScript
npm run build

# Run with Docker
docker build -t kernel .
docker run -p 4222:4222 -p 8080:8080 \
  -e FIREBASE_PROJECT_ID=your-project \
  -e GCS_BUCKET=your-bucket \
  kernel
```

### Testing the endpoints

```bash
# Test health check
curl http://localhost:8080/health

# Test auth (will fail without a real Firebase token)
curl -X POST http://localhost:8080/auth/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"your-firebase-token"}'
```

---

## Troubleshooting

### "Auth service unavailable"

**Problem:** Your app can't reach the kernel.

**Solution:**
1. Make sure `KERNEL_AUTH_URL` is set correctly
2. Check if the kernel service is running: `curl $KERNEL_AUTH_URL/../health`

### "TOKEN_EXPIRED"

**Problem:** The Firebase token has expired.

**Solution:** Refresh the token in your frontend using the Firebase SDK:
```typescript
const token = await firebase.auth().currentUser.getIdToken(true);
```

### "NATS connection refused"

**Problem:** Your app can't connect to NATS.

**Solution:**
1. Make sure `NATS_URL` is set correctly
2. Check if the kernel service is running
3. Make sure port 4222 is accessible

### File upload fails

**Problem:** The signed URL doesn't work.

**Common causes:**
1. **Wrong content type:** The `contentType` in your request must match the file being uploaded
2. **URL expired:** Signed URLs expire after 1 hour by default
3. **Invalid path:** Paths can't start with `/` or contain `..`

---

## Summary

| What | How to use |
|------|------------|
| **Validate a user** | POST to `KERNEL_AUTH_URL/validate` with the Firebase token |
| **Get upload URL** | NATS request to `kernel.files.upload-url` |
| **Get download URL** | NATS request to `kernel.files.download-url` |
| **Publish an event** | NATS publish to `kernel.events.{type}` |
| **Subscribe to events** | Create a JetStream consumer on `KERNEL_EVENTS` |