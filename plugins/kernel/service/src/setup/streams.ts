/**
 * JetStream Setup
 * Creates KERNEL_EVENTS stream for durable event logging
 */

import type { NatsConnection } from 'nats';

const KERNEL_EVENTS_STREAM = 'KERNEL_EVENTS';

/**
 * Setup JetStream streams
 */
export async function setupStreams(nc: NatsConnection): Promise<void> {
  const jsm = await nc.jetstreamManager();

  // Check if stream already exists
  try {
    await jsm.streams.info(KERNEL_EVENTS_STREAM);
    console.log(`Stream ${KERNEL_EVENTS_STREAM} already exists`);
    return;
  } catch {
    // Stream doesn't exist, create it
  }

  // Create KERNEL_EVENTS stream
  await jsm.streams.add({
    name: KERNEL_EVENTS_STREAM,
    subjects: ['kernel.events.>'],
    retention: 'limits' as const,
    max_age: 7 * 24 * 60 * 60 * 1000 * 1000000, // 7 days in nanoseconds
    max_bytes: 1024 * 1024 * 1024, // 1GB
    storage: 'file' as const,
    num_replicas: 1,
    discard: 'old' as const,
  });

  console.log(`Created stream ${KERNEL_EVENTS_STREAM}`);
}