/**
 * Events Routes
 *
 * POST /events/publish      - Publish event to Pub/Sub
 * POST /events/subscribe    - Register HTTP push subscription
 * POST /events/unsubscribe  - Remove subscription
 * GET  /events/subscriptions - List subscriptions
 */

import { Router, Request, Response } from 'express';
import {
  publishEvent,
  createSubscription,
  deleteSubscription,
  listSubscriptions,
} from '../services/pubsub.js';

export const eventsRouter = Router();

// POST /events/publish
eventsRouter.post('/publish', async (req: Request, res: Response) => {
  try {
    const { eventType, data, metadata } = req.body as {
      eventType: string;
      data: unknown;
      metadata?: Record<string, string>;
    };

    if (!eventType) {
      res.status(400).json({
        error: 'eventType is required',
        code: 'MISSING_EVENT_TYPE',
      });
      return;
    }

    const result = await publishEvent(eventType, data, metadata);
    res.json({
      published: true,
      ...result,
    });
  } catch (error) {
    console.error('Error publishing event:', error);
    res.status(500).json({
      error: 'Failed to publish event',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /events/subscribe
eventsRouter.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { pattern, endpoint, serviceName } = req.body as {
      pattern: string;
      endpoint: string;
      serviceName?: string;
    };

    if (!pattern) {
      res.status(400).json({
        error: 'pattern is required',
        code: 'MISSING_PATTERN',
      });
      return;
    }

    if (!endpoint) {
      res.status(400).json({
        error: 'endpoint is required',
        code: 'MISSING_ENDPOINT',
      });
      return;
    }

    // Validate endpoint is a valid URL
    try {
      new URL(endpoint);
    } catch {
      res.status(400).json({
        error: 'endpoint must be a valid URL',
        code: 'INVALID_ENDPOINT',
      });
      return;
    }

    const result = await createSubscription(pattern, endpoint, serviceName);
    res.json({
      subscribed: true,
      ...result,
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      error: 'Failed to create subscription',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /events/unsubscribe
eventsRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.body as { subscriptionId: string };

    if (!subscriptionId) {
      res.status(400).json({
        error: 'subscriptionId is required',
        code: 'MISSING_SUBSCRIPTION_ID',
      });
      return;
    }

    await deleteSubscription(subscriptionId);
    res.json({
      unsubscribed: true,
      subscriptionId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({
        error: 'Subscription not found',
        code: 'NOT_FOUND',
      });
      return;
    }
    console.error('Error deleting subscription:', error);
    res.status(500).json({
      error: 'Failed to delete subscription',
      code: 'INTERNAL_ERROR',
    });
  }
});

// GET /events/subscriptions
eventsRouter.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    const pattern = req.query.pattern as string | undefined;
    const subs = listSubscriptions(pattern);
    res.json({ subscriptions: subs });
  } catch (error) {
    console.error('Error listing subscriptions:', error);
    res.status(500).json({
      error: 'Failed to list subscriptions',
      code: 'INTERNAL_ERROR',
    });
  }
});
