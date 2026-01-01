/**
 * Health Check Route
 * GET /health - Returns service health status
 */

import { Router } from 'express';
import type { NatsConnection } from 'nats';

export function createHealthRouter(getNatsConnection: () => NatsConnection | null): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const nc = getNatsConnection();
    const natsStatus = nc && !nc.isClosed() ? 'connected' : 'disconnected';

    res.json({
      status: 'ok',
      nats: natsStatus,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}