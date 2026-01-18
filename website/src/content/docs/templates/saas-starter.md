---
title: SaaS Starter Template
description: Complete SaaS foundation with Firebase Auth, Stripe billing, and Vue 3
---

Complete SaaS foundation with Firebase Auth, Stripe billing, PostgreSQL database, and Vue 3 frontend. Everything you need to launch a subscription-based product.

## Quick Start

```bash
# Create project
stacksolo init --template saas-starter

# Install dependencies
cd my-saas
npm install

# Set up Stripe secrets
echo "sk_test_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-

# Start development
stacksolo dev
```

## What's Included

### Frontend (Vue 3)
- Firebase SDK for authentication (email/password, Google)
- Pinia stores for auth and subscription state
- Vue Router with protected routes
- Tailwind CSS styling
- Landing page with pricing
- Dashboard, Settings, Billing pages
- Stripe checkout and customer portal integration

### Backend
- Express API on Cloud Functions
- Drizzle ORM with PostgreSQL
- User and Subscription repositories
- Stripe integration (checkout, portal, webhooks)
- Webhook handler for subscription events

## Project Structure

```
├── apps/web/                    # Vue 3 frontend
│   └── src/
│       ├── components/
│       │   ├── layout/          # Navbar, DashboardLayout
│       │   └── ...
│       ├── stores/
│       │   ├── auth.ts          # Firebase auth store
│       │   └── subscription.ts
│       ├── pages/
│       │   ├── Landing.vue
│       │   ├── Login.vue
│       │   ├── Dashboard.vue
│       │   ├── Settings.vue
│       │   └── Billing.vue
│       ├── router/index.ts
│       └── lib/
│           ├── firebase.ts
│           └── api.ts

├── functions/api/               # Express API
│   └── src/
│       ├── db/
│       │   ├── index.ts         # Drizzle connection
│       │   └── schema.ts        # User, Subscription tables
│       ├── repositories/
│       │   ├── user.repository.ts
│       │   └── subscription.repository.ts
│       ├── services/
│       │   └── stripe.service.ts
│       ├── routes/
│       │   ├── user.ts
│       │   ├── billing.ts
│       │   └── webhooks.ts
│       └── index.ts

└── stacksolo.config.json
```

## Database Schema

```typescript
// users - synced from Firebase Auth
export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(),  // Firebase UID
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
});

// subscriptions - synced from Stripe
export const subscriptions = pgTable('subscriptions', {
  id: varchar('id', { length: 255 }).primaryKey(),  // Stripe subscription ID
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  status: varchar('status', { length: 50 }).notNull(),  // active, canceled, past_due
  priceId: varchar('price_id', { length: 255 }).notNull(),
  productId: varchar('product_id', { length: 255 }),
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
});
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Health check |
| GET | /api/user/profile | Yes | Get current user |
| PUT | /api/user/profile | Yes | Update profile |
| GET | /api/billing/plans | Yes | Get available plans |
| GET | /api/billing/subscription | Yes | Get current subscription |
| POST | /api/billing/checkout | Yes | Create Stripe checkout session |
| POST | /api/billing/portal | Yes | Create Stripe customer portal |
| POST | /api/webhooks/stripe | No* | Stripe webhook handler |

*Verified by Stripe signature

## Stripe Setup

1. **Create Stripe account** at https://stripe.com
2. **Create products and prices** in Stripe Dashboard:
   - Pro plan: $19/month
   - Business plan: $49/month
3. **Update price IDs** in `services/stripe.service.ts`:

```typescript
const PLANS = {
  pro: {
    name: 'Pro',
    priceId: 'price_xxx',  // Your Stripe price ID
    features: ['Priority support', 'Advanced analytics'],
  },
  business: {
    name: 'Business',
    priceId: 'price_yyy',  // Your Stripe price ID
    features: ['All Pro features', 'Custom integrations', 'SLA'],
  },
};
```

4. **Create secrets**:

```bash
echo "sk_test_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-
```

## Stripe Webhook Events

The webhook handler processes:
- `checkout.session.completed` - Create subscription after checkout
- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Subscription changes
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_failed` - Failed payment

## Frontend Pages

| Route | Page | Auth Required |
|-------|------|---------------|
| `/` | Landing with pricing | No |
| `/login` | Email + Google login | No |
| `/signup` | Email + Google signup | No |
| `/dashboard` | User dashboard | Yes |
| `/settings` | Profile settings | Yes |
| `/billing` | Subscription management | Yes |

## Customization

### Adding Features

Common additions:
- **Teams/Organizations** - Add team tables and invite flow
- **Usage Limits** - Track feature usage per plan
- **Admin Dashboard** - Add admin-only routes
- **Email Notifications** - Integrate Resend or SendGrid

### Adding New API Routes

```typescript
// In routes/your-feature.ts
import { Router } from 'express';
import { kernel } from '@stacksolo/runtime';

const router = Router();

// Protected route
router.get('/your-feature', kernel.authMiddleware(), async (req, res) => {
  const userId = req.user!.uid;
  // Your logic here
  res.json({ data: [] });
});

export default router;
```

## Environment Variables

For local development, create `.env.local`:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

## Deployment

```bash
# Deploy everything
stacksolo deploy

# After deployment, set up Stripe webhook in Dashboard:
# URL: https://your-domain.com/api/webhooks/stripe
# Events: checkout.session.completed, customer.subscription.*
```

This creates:
- Cloud Functions API
- Cloud SQL PostgreSQL
- Cloud Storage for frontend
- Load balancer with SSL
