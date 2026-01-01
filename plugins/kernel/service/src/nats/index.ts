/**
 * NATS Connection and Handlers
 */

import { connect, type NatsConnection } from 'nats';
import { config } from '../config';
import { setupFilesHandlers } from './files';

let natsConnection: NatsConnection | null = null;

/**
 * Connect to NATS server and setup handlers
 */
export async function startNatsHandlers(natsUrl: string): Promise<NatsConnection> {
  // Connect to NATS
  natsConnection = await connect({
    servers: natsUrl,
    name: 'kernel-service',
    reconnect: true,
    maxReconnectAttempts: -1, // Unlimited reconnects
    reconnectTimeWait: 1000,
  });

  console.log(`Connected to NATS at ${natsUrl}`);

  // Setup connection status logging
  (async () => {
    for await (const status of natsConnection!.status()) {
      console.log(`NATS status: ${status.type}`, status.data);
    }
  })();

  // Setup handlers
  const filesSubs = setupFilesHandlers(natsConnection);
  console.log(`Registered ${filesSubs.length} files handlers`);

  return natsConnection;
}

/**
 * Get the current NATS connection
 */
export function getNatsConnection(): NatsConnection | null {
  return natsConnection;
}

/**
 * Gracefully drain and close NATS connection
 */
export async function closeNatsConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.drain();
    natsConnection = null;
  }
}