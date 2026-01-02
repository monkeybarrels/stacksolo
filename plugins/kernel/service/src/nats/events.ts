/**
 * Events NATS Handlers with JetStream + HTTP Push
 *
 * kernel.events.publish - Publish event to JetStream
 * kernel.events.subscribe - Register HTTP endpoint for event delivery
 * kernel.events.unsubscribe - Remove HTTP endpoint subscription
 * kernel.events.list-subscriptions - List active subscriptions
 *
 * The kernel acts as a push gateway:
 * 1. Events are stored in JetStream (durable)
 * 2. Kernel consumes events and pushes to registered HTTP endpoints
 * 3. Functions/services register their endpoints at startup
 */

import type { NatsConnection, Subscription, ConsumerMessages } from 'nats';
import { StringCodec, AckPolicy, DeliverPolicy } from 'nats';

const sc = StringCodec();

// =============================================================================
// Types
// =============================================================================

interface PublishRequest {
  eventType: string;
  data: unknown;
  metadata?: Record<string, string>;
}

interface PublishResponse {
  published: true;
  eventType: string;
  seq: number;
  timestamp: string;
}

interface SubscribeRequest {
  /** Event pattern to subscribe to (e.g., 'user.created', 'order.*') */
  pattern: string;
  /** HTTP endpoint to deliver events to */
  endpoint: string;
  /** Optional service name for tracking */
  serviceName?: string;
  /** Retry config */
  maxRetries?: number;
  retryDelayMs?: number;
}

interface SubscribeResponse {
  subscribed: true;
  subscriptionId: string;
  pattern: string;
  endpoint: string;
}

interface UnsubscribeRequest {
  subscriptionId: string;
}

interface UnsubscribeResponse {
  unsubscribed: true;
  subscriptionId: string;
}

interface ListSubscriptionsRequest {
  pattern?: string;
}

interface SubscriptionInfo {
  subscriptionId: string;
  pattern: string;
  endpoint: string;
  serviceName?: string;
  createdAt: string;
  deliveredCount: number;
  failedCount: number;
}

interface ListSubscriptionsResponse {
  subscriptions: SubscriptionInfo[];
}

interface ErrorResponse {
  error: string;
  code: string;
}

interface EventPayload {
  type: string;
  data: unknown;
  metadata?: Record<string, string>;
  timestamp: string;
  seq?: number;
}

// =============================================================================
// Subscription Registry (in-memory, could be moved to persistent storage)
// =============================================================================

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

function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${++subscriptionCounter}`;
}

/**
 * Check if an event type matches a subscription pattern
 * Supports wildcards: 'user.*' matches 'user.created', 'user.updated'
 * Supports '>': 'order.>' matches 'order.created', 'order.item.added'
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
// HTTP Push Delivery
// =============================================================================

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
// JetStream Consumer
// =============================================================================

let consumerRunning = false;
let consumerMessages: ConsumerMessages | null = null;

/**
 * Start the JetStream consumer that delivers events to HTTP endpoints
 */
async function startEventConsumer(nc: NatsConnection): Promise<void> {
  if (consumerRunning) return;

  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  // Create or get durable consumer
  const consumerName = 'kernel-http-push';

  try {
    await jsm.consumers.info('KERNEL_EVENTS', consumerName);
  } catch {
    // Consumer doesn't exist, create it
    await jsm.consumers.add('KERNEL_EVENTS', {
      durable_name: consumerName,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.New,
      filter_subject: 'kernel.events.>',
    });
  }

  // Get consumer
  const consumer = await js.consumers.get('KERNEL_EVENTS', consumerName);
  consumerMessages = await consumer.consume();
  consumerRunning = true;

  console.log('Started JetStream event consumer for HTTP push delivery');

  // Process messages
  (async () => {
    for await (const msg of consumerMessages!) {
      try {
        const event: EventPayload = JSON.parse(sc.decode(msg.data));

        // Extract event type from subject (kernel.events.user.created -> user.created)
        const eventType = msg.subject.replace('kernel.events.', '');
        event.type = eventType;
        event.seq = msg.seq;

        // Find matching subscriptions
        const matchingSubs = getMatchingSubscriptions(eventType);

        if (matchingSubs.length === 0) {
          // No subscribers, ack and continue
          msg.ack();
          continue;
        }

        // Deliver to all matching subscriptions in parallel
        const deliveryResults = await Promise.all(
          matchingSubs.map((sub) => deliverEvent(sub, event))
        );

        // If all deliveries succeeded (or there were no subscribers), ack
        // If any failed, we still ack to avoid blocking the stream
        // (failed deliveries are logged and counted)
        msg.ack();

        const successCount = deliveryResults.filter(Boolean).length;
        if (successCount < matchingSubs.length) {
          console.warn(
            `Event ${eventType} delivered to ${successCount}/${matchingSubs.length} subscribers`
          );
        }
      } catch (error) {
        console.error('Error processing event:', error);
        // Ack anyway to avoid blocking
        msg.ack();
      }
    }
  })();
}

/**
 * Stop the event consumer
 */
async function stopEventConsumer(): Promise<void> {
  if (consumerMessages) {
    await consumerMessages.close();
    consumerMessages = null;
  }
  consumerRunning = false;
}

// =============================================================================
// NATS Handlers
// =============================================================================

/**
 * Setup events NATS handlers
 */
export function setupEventsHandlers(nc: NatsConnection): Subscription[] {
  const subs: Subscription[] = [];
  const js = nc.jetstream();

  // Start the background consumer for HTTP push
  startEventConsumer(nc).catch((error) => {
    console.error('Failed to start event consumer:', error);
  });

  // kernel.events.publish - Publish event to JetStream
  const publishSub = nc.subscribe('kernel.events.publish', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: PublishRequest = JSON.parse(sc.decode(msg.data));

        if (!request.eventType) {
          const response: ErrorResponse = {
            error: 'eventType is required',
            code: 'MISSING_EVENT_TYPE',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        const timestamp = new Date().toISOString();
        const payload: EventPayload = {
          type: request.eventType,
          data: request.data,
          metadata: request.metadata,
          timestamp,
        };

        // Publish to JetStream
        const subject = `kernel.events.${request.eventType}`;
        const ack = await js.publish(subject, sc.encode(JSON.stringify(payload)));

        const response: PublishResponse = {
          published: true,
          eventType: request.eventType,
          seq: ack.seq,
          timestamp,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error publishing event:', error);
        const response: ErrorResponse = {
          error: 'Failed to publish event',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });
  subs.push(publishSub);

  // kernel.events.subscribe - Register HTTP endpoint for events
  const subscribeSub = nc.subscribe('kernel.events.subscribe', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: SubscribeRequest = JSON.parse(sc.decode(msg.data));

        if (!request.pattern) {
          const response: ErrorResponse = {
            error: 'pattern is required',
            code: 'MISSING_PATTERN',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        if (!request.endpoint) {
          const response: ErrorResponse = {
            error: 'endpoint is required',
            code: 'MISSING_ENDPOINT',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        // Validate endpoint is a valid URL
        try {
          new URL(request.endpoint);
        } catch {
          const response: ErrorResponse = {
            error: 'endpoint must be a valid URL',
            code: 'INVALID_ENDPOINT',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        const subscriptionId = generateSubscriptionId();
        const subscription: RegisteredSubscription = {
          id: subscriptionId,
          pattern: request.pattern,
          endpoint: request.endpoint,
          serviceName: request.serviceName,
          maxRetries: request.maxRetries ?? 3,
          retryDelayMs: request.retryDelayMs ?? 1000,
          createdAt: new Date(),
          deliveredCount: 0,
          failedCount: 0,
        };

        subscriptions.set(subscriptionId, subscription);

        console.log(
          `Registered subscription ${subscriptionId}: ${request.pattern} -> ${request.endpoint}`
        );

        const response: SubscribeResponse = {
          subscribed: true,
          subscriptionId,
          pattern: request.pattern,
          endpoint: request.endpoint,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error registering subscription:', error);
        const response: ErrorResponse = {
          error: 'Failed to register subscription',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });
  subs.push(subscribeSub);

  // kernel.events.unsubscribe - Remove subscription
  const unsubscribeSub = nc.subscribe('kernel.events.unsubscribe', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: UnsubscribeRequest = JSON.parse(sc.decode(msg.data));

        if (!request.subscriptionId) {
          const response: ErrorResponse = {
            error: 'subscriptionId is required',
            code: 'MISSING_SUBSCRIPTION_ID',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        if (!subscriptions.has(request.subscriptionId)) {
          const response: ErrorResponse = {
            error: 'Subscription not found',
            code: 'NOT_FOUND',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        subscriptions.delete(request.subscriptionId);
        console.log(`Removed subscription ${request.subscriptionId}`);

        const response: UnsubscribeResponse = {
          unsubscribed: true,
          subscriptionId: request.subscriptionId,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error removing subscription:', error);
        const response: ErrorResponse = {
          error: 'Failed to remove subscription',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });
  subs.push(unsubscribeSub);

  // kernel.events.list-subscriptions - List active subscriptions
  const listSub = nc.subscribe('kernel.events.list-subscriptions', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: ListSubscriptionsRequest = JSON.parse(sc.decode(msg.data));

        let subs = Array.from(subscriptions.values());

        // Filter by pattern if provided
        if (request.pattern) {
          subs = subs.filter((s) => s.pattern === request.pattern);
        }

        const response: ListSubscriptionsResponse = {
          subscriptions: subs.map((s) => ({
            subscriptionId: s.id,
            pattern: s.pattern,
            endpoint: s.endpoint,
            serviceName: s.serviceName,
            createdAt: s.createdAt.toISOString(),
            deliveredCount: s.deliveredCount,
            failedCount: s.failedCount,
          })),
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error listing subscriptions:', error);
        const response: ErrorResponse = {
          error: 'Failed to list subscriptions',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });
  subs.push(listSub);

  return subs;
}

/**
 * Cleanup - stop consumer and clear subscriptions
 */
export async function cleanupEventsHandlers(): Promise<void> {
  await stopEventConsumer();
  subscriptions.clear();
}
