/**
 * Cloud Pub/Sub Service
 *
 * Handles event publishing and subscription management.
 * Replaces NATS/JetStream for GCP deployments.
 *
 * Architecture:
 * - Single pull subscription consumes all events from the topic
 * - Kernel filters events by pattern and pushes to matching HTTP endpoints
 * - Same pattern matching as NATS kernel (* = single segment, > = multi-segment)
 */

import { PubSub, Message } from '@google-cloud/pubsub';

const pubsub = new PubSub();

// In-memory subscription registry
interface RegisteredSubscription {
  id: string;
  pattern: string;
  endpoint: string;
  serviceName?: string;
  maxRetries: number;
  retryDelayMs: number;
  createdAt: Date;
  deliveredCount: number;
  failedCount: number;
}

const subscriptions = new Map<string, RegisteredSubscription>();
let subscriptionCounter = 0;
let consumerRunning = false;

function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${++subscriptionCounter}`;
}

function getEventsTopic() {
  const topicName = process.env.PUBSUB_EVENTS_TOPIC;
  if (!topicName) {
    throw new Error('PUBSUB_EVENTS_TOPIC environment variable not set');
  }
  return pubsub.topic(topicName);
}

// =============================================================================
// Pattern Matching (same as NATS kernel)
// =============================================================================

/**
 * Check if an event type matches a subscription pattern
 * Supports wildcards:
 *   '*' - matches single segment (e.g., 'user.*' matches 'user.created')
 *   '>' - matches multiple segments (e.g., 'order.>' matches 'order.item.added')
 */
function matchesPattern(eventType: string, pattern: string): boolean {
  // Exact match
  if (eventType === pattern) return true;

  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '[^.]+')
    .replace(/>/g, '.+');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(eventType);
}

/**
 * Get all subscriptions that match an event type
 */
function getMatchingSubscriptions(eventType: string): RegisteredSubscription[] {
  const matches: RegisteredSubscription[] = [];
  for (const sub of subscriptions.values()) {
    if (matchesPattern(eventType, sub.pattern)) {
      matches.push(sub);
    }
  }
  return matches;
}

// =============================================================================
// HTTP Push Delivery (same as NATS kernel)
// =============================================================================

interface EventPayload {
  type: string;
  data: unknown;
  metadata?: Record<string, string>;
  timestamp: string;
  messageId?: string;
}

/**
 * Deliver an event to an HTTP endpoint with retries
 */
async function deliverEvent(
  subscription: RegisteredSubscription,
  event: EventPayload
): Promise<boolean> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= subscription.maxRetries; attempt++) {
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Type': event.type,
          'X-Event-Timestamp': event.timestamp,
          'X-Subscription-Id': subscription.id,
          'X-Delivery-Attempt': String(attempt + 1),
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (response.ok) {
        subscription.deliveredCount++;
        return true;
      }

      // Non-retryable status codes
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.error(
          `Event delivery to ${subscription.endpoint} failed with ${response.status}, not retrying`
        );
        subscription.failedCount++;
        return false;
      }

      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Wait before retry (exponential backoff)
    if (attempt < subscription.maxRetries) {
      const delay = subscription.retryDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error(
    `Event delivery to ${subscription.endpoint} failed after ${subscription.maxRetries + 1} attempts:`,
    lastError
  );
  subscription.failedCount++;
  return false;
}

// =============================================================================
// Pub/Sub Consumer
// =============================================================================

/**
 * Start the Pub/Sub consumer that delivers events to HTTP endpoints
 */
export async function startEventConsumer(): Promise<void> {
  if (consumerRunning) return;

  const topicName = process.env.PUBSUB_EVENTS_TOPIC;
  if (!topicName) {
    console.warn('PUBSUB_EVENTS_TOPIC not set, event consumer not started');
    return;
  }

  // Use a single pull subscription for the kernel
  const subscriptionName = `${topicName}-kernel-consumer`;

  // Get or create the subscription
  let subscription;
  try {
    subscription = pubsub.subscription(subscriptionName);
    const [exists] = await subscription.exists();
    if (!exists) {
      const topic = getEventsTopic();
      [subscription] = await topic.createSubscription(subscriptionName, {
        ackDeadlineSeconds: 60,
        retryPolicy: {
          minimumBackoff: { seconds: 10 },
          maximumBackoff: { seconds: 600 },
        },
      });
      console.log(`Created Pub/Sub subscription: ${subscriptionName}`);
    }
  } catch (error) {
    console.error('Failed to setup Pub/Sub subscription:', error);
    return;
  }

  consumerRunning = true;
  console.log('Started Pub/Sub event consumer for HTTP push delivery');

  // Process messages
  subscription.on('message', async (message: Message) => {
    try {
      const payload = JSON.parse(message.data.toString());
      const eventType = payload.type || message.attributes?.eventType || 'unknown';

      const event: EventPayload = {
        type: eventType,
        data: payload.data,
        metadata: payload.metadata,
        timestamp: payload.timestamp || new Date().toISOString(),
        messageId: message.id,
      };

      // Find matching subscriptions
      const matchingSubs = getMatchingSubscriptions(eventType);

      if (matchingSubs.length === 0) {
        // No subscribers, ack and continue
        message.ack();
        return;
      }

      // Deliver to all matching subscriptions in parallel
      const deliveryResults = await Promise.all(
        matchingSubs.map((sub) => deliverEvent(sub, event))
      );

      // Ack the message (we don't retry at Pub/Sub level, we handle retries ourselves)
      message.ack();

      const successCount = deliveryResults.filter(Boolean).length;
      if (successCount < matchingSubs.length) {
        console.warn(
          `Event ${eventType} delivered to ${successCount}/${matchingSubs.length} subscribers`
        );
      }
    } catch (error) {
      console.error('Error processing event:', error);
      // Ack anyway to avoid blocking
      message.ack();
    }
  });

  subscription.on('error', (error) => {
    console.error('Pub/Sub subscription error:', error);
  });
}

/**
 * Stop the event consumer
 */
export function stopEventConsumer(): void {
  consumerRunning = false;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Publish an event to Pub/Sub
 */
export async function publishEvent(
  eventType: string,
  data: unknown,
  metadata?: Record<string, string>
): Promise<{ messageId: string; eventType: string; timestamp: string }> {
  const topic = getEventsTopic();

  const timestamp = new Date().toISOString();
  const payload = {
    type: eventType,
    data,
    metadata,
    timestamp,
  };

  const messageId = await topic.publishMessage({
    data: Buffer.from(JSON.stringify(payload)),
    attributes: {
      eventType,
      timestamp,
      ...metadata,
    },
  });

  return {
    messageId,
    eventType,
    timestamp,
  };
}

/**
 * Create a subscription for event delivery
 * Events matching the pattern will be pushed to the endpoint
 */
export async function createSubscription(
  pattern: string,
  endpoint: string,
  serviceName?: string
): Promise<{
  subscriptionId: string;
  pattern: string;
  endpoint: string;
}> {
  const subscriptionId = generateSubscriptionId();

  const registered: RegisteredSubscription = {
    id: subscriptionId,
    pattern,
    endpoint,
    serviceName,
    maxRetries: 3,
    retryDelayMs: 1000,
    createdAt: new Date(),
    deliveredCount: 0,
    failedCount: 0,
  };

  subscriptions.set(subscriptionId, registered);

  console.log(`Registered subscription ${subscriptionId}: ${pattern} -> ${endpoint}`);

  return {
    subscriptionId,
    pattern,
    endpoint,
  };
}

/**
 * Delete a subscription
 */
export async function deleteSubscription(subscriptionId: string): Promise<void> {
  const registered = subscriptions.get(subscriptionId);
  if (!registered) {
    throw new Error('NOT_FOUND');
  }

  subscriptions.delete(subscriptionId);
  console.log(`Deleted subscription ${subscriptionId}`);
}

/**
 * List all subscriptions
 */
export function listSubscriptions(pattern?: string): Array<{
  subscriptionId: string;
  pattern: string;
  endpoint: string;
  serviceName?: string;
  createdAt: string;
  deliveredCount: number;
  failedCount: number;
}> {
  let subs = Array.from(subscriptions.values());

  if (pattern) {
    subs = subs.filter((s) => s.pattern === pattern);
  }

  return subs.map((s) => ({
    subscriptionId: s.id,
    pattern: s.pattern,
    endpoint: s.endpoint,
    serviceName: s.serviceName,
    createdAt: s.createdAt.toISOString(),
    deliveredCount: s.deliveredCount,
    failedCount: s.failedCount,
  }));
}

/**
 * Check if an event type matches a pattern (exported for testing)
 */
export { matchesPattern };
