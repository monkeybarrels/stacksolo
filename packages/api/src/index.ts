import express, { type Express } from 'express';
import cors from 'cors';
import * as trpcExpress from '@trpc/server/adapters/express';
import { registry } from '@stacksolo/core';
import gcpCdktfPlugin from '@stacksolo/plugin-gcp-cdktf';

import { initDatabase } from './db/index';
import {
  SQLiteProjectRepository,
  SQLiteResourceRepository,
  SQLiteDeploymentRepository,
} from './repositories/index';
import { createAppRouter } from './routes/index';
import { deploymentEvents } from './services/deployment-events';

export interface ServerOptions {
  port?: number;
  host?: string;
}

/**
 * Create and configure the Express app without starting the server.
 * Useful for testing or embedding in other servers.
 */
export async function createApp(): Promise<Express> {
  // Initialize database
  await initDatabase();

  // Register plugins
  registry.registerPlugin(gcpCdktfPlugin);

  // Create repositories
  const projectRepo = new SQLiteProjectRepository();
  const resourceRepo = new SQLiteResourceRepository();
  const deploymentRepo = new SQLiteDeploymentRepository();

  // Create tRPC router
  const appRouter = createAppRouter(projectRepo, resourceRepo, deploymentRepo);

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // SSE endpoint for deployment logs
  app.get('/deployments/:id/stream', (req, res) => {
    const deploymentId = req.params.id;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', deploymentId })}\n\n`);

    // Subscribe to deployment events
    const unsubscribe = deploymentEvents.subscribe(deploymentId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Close connection when deployment completes
      if (event.type === 'complete') {
        setTimeout(() => {
          res.end();
        }, 100);
      }
    });

    // Cleanup on client disconnect
    req.on('close', () => {
      unsubscribe();
    });
  });

  // tRPC endpoint
  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router: appRouter,
    })
  );

  return app;
}

/**
 * Start the StackSolo API server.
 * Can be imported and called from CLI or Electron.
 */
export async function startServer(options: ServerOptions = {}): Promise<void> {
  const port = options.port || parseInt(process.env.PORT || '4000', 10);
  const host = options.host || process.env.HOST || 'localhost';

  console.log('Initializing database...');
  console.log('Registering plugins...');

  const app = await createApp();

  // Start server
  app.listen(port, host, () => {
    console.log(`StackSolo API running at http://${host}:${port}`);
    console.log(`  tRPC endpoint: http://${host}:${port}/trpc`);
    console.log(`  Providers: ${registry.getAllProviders().map((p) => p.name).join(', ')}`);
  });
}

// Run directly if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export type { AppRouter } from './routes/index';
