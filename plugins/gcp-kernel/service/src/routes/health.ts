/**
 * Health Check Route
 */

import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'gcp-kernel',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      gcpProject: process.env.GCP_PROJECT_ID || 'not set',
      firebaseProject: process.env.FIREBASE_PROJECT_ID || 'not set',
      bucket: process.env.GCS_BUCKET || 'not set',
      topic: process.env.PUBSUB_EVENTS_TOPIC || 'not set',
    },
  });
});
