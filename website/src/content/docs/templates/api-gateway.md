---
title: API Gateway Template
description: API monetization platform with key management, rate limiting, and usage tracking
---

API monetization platform with API key management, rate limiting (Redis), usage tracking, and a developer portal.

## Quick Start

```bash
# Create project
stacksolo init --template api-gateway

# Install dependencies
cd my-api-gateway
npm install

# Start development
stacksolo dev
```

## What's Included

### Frontend (Vue 3) - Developer Portal
- Firebase SDK for authentication
- Pinia stores for API keys and usage data
- Vue Router with protected routes
- Tailwind CSS styling
- Dashboard with usage overview
- API Keys management (create, revoke, rotate)
- Usage analytics with charts
- API documentation page

### Backend
- Express API on Cloud Functions
- API key generation and validation
- Redis-based rate limiting (sliding window)
- PostgreSQL for keys and usage tracking
- Usage recording middleware
- Drizzle ORM

## Project Structure

```
├── apps/web/                    # Vue 3 Developer Portal
│   └── src/
│       ├── components/
│       │   ├── DashboardLayout.vue
│       │   └── ApiKeyCard.vue
│       ├── stores/
│       │   ├── auth.ts
│       │   └── apiKeys.ts
│       ├── pages/
│       │   ├── Dashboard.vue
│       │   ├── ApiKeys.vue
│       │   ├── Usage.vue
│       │   └── Docs.vue
│       └── lib/
│           ├── firebase.ts
│           └── api.ts

├── functions/api/               # Express API
│   └── src/
│       ├── middleware/
│       │   ├── apiKey.ts        # API key validation
│       │   ├── rateLimit.ts     # Redis rate limiting
│       │   └── usage.ts         # Usage tracking
│       ├── services/
│       │   ├── redis.service.ts # Rate limit counters
│       │   └── apiKey.service.ts# Key generation
│       ├── db/
│       │   ├── index.ts
│       │   └── schema.ts
│       └── routes/
│           ├── admin.ts         # Portal endpoints
│           └── gateway.ts       # Public API endpoints

└── stacksolo.config.json
```

## Database Schema

```typescript
// API Keys
export const apiKeys = pgTable('api_keys', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 128 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 12 }).notNull(),
  plan: varchar('plan', { length: 50 }).notNull().default('free'),
  rateLimit: integer('rate_limit').notNull().default(100),
  dailyLimit: integer('daily_limit').notNull().default(1000),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Daily Usage Aggregates
export const dailyUsage = pgTable('daily_usage', {
  id: serial('id').primaryKey(),
  apiKeyId: varchar('api_key_id', { length: 64 }).notNull(),
  date: varchar('date', { length: 10 }).notNull(),
  requestCount: integer('request_count').notNull().default(0),
  errorCount: integer('error_count').notNull().default(0),
  avgResponseTimeMs: integer('avg_response_time_ms'),
});
```

## API Endpoints

### Admin Endpoints (Firebase Auth Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/profile | Get user profile |
| GET | /api/admin/keys | List API keys |
| POST | /api/admin/keys | Create API key |
| DELETE | /api/admin/keys/:id | Revoke key |
| POST | /api/admin/keys/:id/rotate | Rotate key |
| GET | /api/admin/usage | Get usage stats |

### Gateway Endpoints (API Key Required)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/health | Health check |
| POST | /api/v1/echo | Echo request |
| GET | /api/v1/data | Get data |
| POST | /api/v1/data | Create data |

## Rate Limiting

Rate limits use Redis with a sliding window algorithm:

```typescript
// Headers returned with every response
X-RateLimit-Limit: 100       // Requests per minute
X-RateLimit-Remaining: 95    // Remaining in window
X-RateLimit-Reset: 1705315800 // Reset timestamp
```

When rate limited, clients receive:
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Limit is 100 requests per minute.",
  "retryAfter": 30
}
```

## Plans

| Plan | Rate Limit | Daily Limit | Max Keys |
|------|------------|-------------|----------|
| Free | 100/min | 1,000/day | 2 |
| Pro | 1,000/min | 50,000/day | 10 |
| Business | 10,000/min | Unlimited | 50 |

## Customization

### Adding Protected Endpoints

```typescript
// In routes/gateway.ts
router.get('/v1/your-endpoint', apiKeyMiddleware, rateLimitMiddleware, async (req, res) => {
  // req.apiKey contains key info
  res.json({ data: 'your response' });
});
```

### Custom Rate Limit Rules

Modify `middleware/rateLimit.ts` for endpoint-specific limits:

```typescript
const endpointLimits = {
  '/v1/expensive-operation': 10,  // Only 10 per minute
  '/v1/basic-operation': 1000,    // 1000 per minute
};
```

## Deployment

```bash
stacksolo deploy
```

This creates:
- Cloud Functions API
- Cloud SQL PostgreSQL
- Memorystore Redis
- Cloud Storage for frontend
- Load balancer with SSL
