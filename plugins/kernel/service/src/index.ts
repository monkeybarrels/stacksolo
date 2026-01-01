/**
 * StackSolo Kernel Service
 *
 * Hybrid HTTP + NATS shared infrastructure:
 * - HTTP: /auth/validate (public), /health
 * - NATS: kernel.files.*, kernel.events.* (internal)
 */

import { startHttpServer, setNatsConnection } from './http';
import { startNatsHandlers, closeNatsConnection } from './nats';
import { setupStreams } from './setup/streams';
import { config, validateConfig } from './config';

async function main(): Promise<void> {
  console.log('Starting kernel service...');

  // Validate configuration
  validateConfig();

  // Start HTTP server (auth, health)
  const http = await startHttpServer(config.httpPort);
  console.log(`HTTP server listening on port ${config.httpPort}`);

  // Connect to NATS and setup handlers
  const nc = await startNatsHandlers(config.natsUrl);
  setNatsConnection(nc);
  console.log(`NATS handlers connected to ${config.natsUrl}`);

  // Setup JetStream streams
  try {
    await setupStreams(nc);
    console.log('JetStream streams configured');
  } catch (error) {
    console.error('Failed to setup JetStream streams:', error);
    // Continue - streams might already exist or JetStream isn't enabled
  }

  console.log('Kernel service started successfully');

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, shutting down...`);

    // Close NATS connection
    await closeNatsConnection();
    console.log('NATS connection closed');

    // Close HTTP server
    http.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start kernel service:', error);
  process.exit(1);
});