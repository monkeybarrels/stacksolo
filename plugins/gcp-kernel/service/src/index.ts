/**
 * GCP Kernel Service
 *
 * A fully GCP-native kernel implementation:
 * - Express HTTP server for all endpoints
 * - Cloud Pub/Sub for event messaging (replaces NATS/JetStream)
 * - Cloud Storage for file operations
 * - Firebase Admin SDK for token validation
 * - Firestore for access control
 *
 * Endpoints:
 * - GET  /health          - Health check
 * - POST /auth/validate   - Validate Firebase token
 * - POST /files/upload-url    - Get signed upload URL
 * - POST /files/download-url  - Get signed download URL
 * - POST /files/list          - List files with prefix
 * - POST /files/delete        - Delete file
 * - POST /files/move          - Move/rename file
 * - POST /files/metadata      - Get file metadata
 * - POST /events/publish      - Publish event to Pub/Sub
 * - POST /events/subscribe    - Register HTTP push subscription
 * - POST /events/unsubscribe  - Remove subscription
 * - GET  /events/subscriptions - List subscriptions
 * - POST /access/grant        - Grant access to a resource
 * - POST /access/revoke       - Revoke access from a resource
 * - POST /access/check        - Check if member has access
 * - GET  /access/list         - List members with access
 * - GET  /access/resources    - List all protected resources
 */

import express from 'express';
import cors from 'cors';
import { initializeFirebase } from './services/firebase.js';
import { startEventConsumer } from './services/pubsub.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { filesRouter } from './routes/files.js';
import { eventsRouter } from './routes/events.js';
import { accessRouter } from './routes/access.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Firebase
initializeFirebase();

// Start event consumer for HTTP push delivery
startEventConsumer().catch((error) => {
  console.error('Failed to start event consumer:', error);
});

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/files', filesRouter);
app.use('/events', eventsRouter);
app.use('/access', accessRouter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'stacksolo-gcp-kernel',
    version: '0.1.0',
    type: 'gcp',
    endpoints: {
      health: '/health',
      auth: '/auth/validate',
      files: '/files/*',
      events: '/events/*',
      access: '/access/*',
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`GCP Kernel service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`GCP Project: ${process.env.GCP_PROJECT_ID || 'not set'}`);
  console.log(`Storage Bucket: ${process.env.GCS_BUCKET || 'not set'}`);
  console.log(`Pub/Sub Topic: ${process.env.PUBSUB_EVENTS_TOPIC || 'not set'}`);
});
