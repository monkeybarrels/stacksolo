/**
 * HTTP Server
 * Express app with auth and health routes
 */

import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import type { NatsConnection } from 'nats';
import { authRouter } from './auth';
import { createHealthRouter } from './health';

let natsConnection: NatsConnection | null = null;

/**
 * Set the NATS connection for health checks
 */
export function setNatsConnection(nc: NatsConnection): void {
  natsConnection = nc;
}

/**
 * Start the HTTP server
 */
export function startHttpServer(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const app = express();

    // Middleware
    app.use(express.json());

    // CORS for auth routes (browser access)
    app.use('/auth', cors({
      origin: true,
      credentials: true,
    }));

    // Routes
    app.use('/', createHealthRouter(() => natsConnection));
    app.use('/auth', authRouter);

    // 404 handler
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('HTTP error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}