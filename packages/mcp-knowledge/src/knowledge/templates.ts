/**
 * Template Knowledge
 *
 * Documentation for available app templates and how to use them.
 */

export const templatesOverview = `# StackSolo App Templates

Templates provide complete, working application code that you can customize. Unlike architectures (which are config-only), templates include:

- Frontend code (React, Vue)
- Backend code (Express API)
- Database schemas and migrations
- Authentication setup
- Ready-to-deploy configuration

## Using Templates

\`\`\`bash
# List available templates
stacksolo init --list-templates

# Create project from template
stacksolo init --template firebase-app

# When prompted, choose:
# - Project name
# - Framework (React/Vue if available)
# - GCP Project ID
# - Region
\`\`\`

## Template vs Architecture vs Stack

| Concept | What it provides | Example |
|---------|------------------|---------|
| **Template** | Full source code + config | firebase-app (React + Firebase Auth + Firestore) |
| **Architecture** | Config only (no code) | nextjs-postgres (just stacksolo.config.json) |
| **Stack** | Template + Architecture combined | Coming soon |
`;

export const firebaseAppTemplate = `# firebase-app Template

Full-stack app with Firebase Authentication and Firestore.

## What's Included

**Frontend (React or Vue):**
- Firebase SDK initialization with emulator detection
- Auth context/composable with login, signup, logout
- Google sign-in support
- Protected routes
- Dashboard component

**Backend:**
- Express API on Cloud Functions
- \`kernel.authMiddleware()\` for protected routes
- Profile endpoint that syncs with Firestore

## Quick Start

\`\`\`bash
stacksolo init --template firebase-app
cd my-app
npm install
npm run dev
\`\`\`

## Project Structure

\`\`\`
├── apps/web/              # React or Vue frontend
│   └── src/
│       ├── firebase.ts    # SDK init + emulator detection
│       ├── contexts/      # AuthContext (React)
│       ├── composables/   # useAuth (Vue)
│       └── components/    # Login, Signup, Dashboard
│
├── functions/api/         # Express API
│   └── src/
│       └── index.ts       # Protected endpoints
│
└── stacksolo.config.json  # Infrastructure config
\`\`\`

## Development

The template auto-detects Firebase emulators in development:

\`\`\`typescript
// Automatically connects to emulators when VITE runs in dev mode
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
\`\`\`

Start emulators:
\`\`\`bash
firebase emulators:start --only auth,firestore
\`\`\`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check (public) |
| GET | /api/profile | Get/create user profile (protected) |
`;

export const firebasePostgresTemplate = `# firebase-postgres Template

Firebase Auth for authentication + Cloud SQL PostgreSQL for data. Uses Drizzle ORM with repository pattern.

## When to Use This

Choose this template when:
- You want Firebase's easy authentication
- But need a relational database (not Firestore)
- You want type-safe SQL with Drizzle ORM
- You prefer the repository pattern for data access

## What's Included

**Frontend (React):**
- Firebase SDK initialization (Auth only, no Firestore)
- Auth context with login, signup, logout, Google sign-in
- Protected routes
- Dashboard with CRUD for items

**Backend:**
- Express API on Cloud Functions
- \`@stacksolo/runtime\` with \`kernel.authMiddleware()\` for Firebase token verification
- Drizzle ORM for type-safe PostgreSQL access
- Repository pattern (one repository per table)
- Pre-built migrations

## Auth Flow

1. **Frontend:** User signs in via Firebase Auth SDK
2. **Frontend:** Gets ID token with \`user.getIdToken()\`
3. **Frontend:** Sends token in \`Authorization: Bearer <token>\` header
4. **Backend:** \`kernel.authMiddleware()\` verifies token with Firebase Admin SDK
5. **Backend:** Populates \`req.user\` with \`{ uid, email, ... }\`

\`\`\`typescript
// Backend: Protected route with kernel middleware
import { kernel } from '@stacksolo/runtime';

app.use('/api', kernel.authMiddleware());

app.get('/api/profile', async (req, res) => {
  // req.user is populated from the verified Firebase token
  const { uid, email } = req.user!;
  const profile = await userRepository.findOrCreate(uid, email);
  res.json(profile);
});
\`\`\`

## Quick Start

\`\`\`bash
# Create project
stacksolo init --template firebase-postgres

# Install dependencies
cd my-app
npm install

# Set up local PostgreSQL (or use Cloud SQL Proxy)
export DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"

# Run migrations
npm run migrate

# Start development
npm run dev
\`\`\`

## Project Structure

\`\`\`
├── apps/web/                    # React frontend
│   └── src/
│       ├── firebase.ts          # Auth only (no Firestore)
│       ├── contexts/AuthContext.tsx
│       └── components/
│           ├── Login.tsx
│           ├── Signup.tsx
│           └── Dashboard.tsx    # Shows items from PostgreSQL
│
├── functions/api/               # Express API
│   └── src/
│       ├── db/
│       │   ├── index.ts         # Drizzle connection
│       │   └── schema.ts        # Table definitions
│       ├── repositories/
│       │   ├── user.repository.ts
│       │   ├── item.repository.ts
│       │   └── index.ts
│       └── index.ts             # API routes
│
├── drizzle/                     # Generated migrations
│   └── 0000_initial.sql
│
└── stacksolo.config.json
\`\`\`

## Repository Pattern

Each table gets its own repository with typed methods:

\`\`\`typescript
// user.repository.ts
export const userRepository = {
  async findById(id: string): Promise<User | null> { ... },
  async findByEmail(email: string): Promise<User | null> { ... },
  async create(data: NewUser): Promise<User> { ... },
  async update(id: string, data: Partial<User>): Promise<User | null> { ... },
  async delete(id: string): Promise<boolean> { ... },
  async findOrCreate(id: string, email: string): Promise<User> { ... },
};

// Usage in API routes
import { userRepository, itemRepository } from './repositories';

app.get('/api/profile', async (req, res) => {
  const profile = await userRepository.findOrCreate(req.user.uid, req.user.email);
  res.json(profile);
});
\`\`\`

## Database Schema

\`\`\`typescript
// db/schema.ts
export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(), // Firebase UID
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
});

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 128 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
});
\`\`\`

## Adding New Tables

1. **Add schema** in \`db/schema.ts\`:
\`\`\`typescript
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
\`\`\`

2. **Create repository** in \`repositories/post.repository.ts\`:
\`\`\`typescript
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { posts, type Post, type NewPost } from '../db/schema';

export const postRepository = {
  async findById(id: number): Promise<Post | null> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post || null;
  },

  async findByUser(userId: string): Promise<Post[]> {
    return db.select().from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt));
  },

  async create(data: NewPost): Promise<Post> {
    const [post] = await db.insert(posts).values(data).returning();
    return post;
  },
};
\`\`\`

3. **Export** from \`repositories/index.ts\`:
\`\`\`typescript
export { postRepository } from './post.repository';
\`\`\`

4. **Generate migration**:
\`\`\`bash
npm run generate --prefix functions/api
\`\`\`

5. **Run migration**:
\`\`\`bash
npm run migrate
\`\`\`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check (public) |
| GET | /api/profile | Get/create user profile |
| PUT | /api/profile | Update profile |
| GET | /api/items | List user's items |
| POST | /api/items | Create item |
| PUT | /api/items/:id | Update item |
| DELETE | /api/items/:id | Delete item |

## Deployment

\`\`\`bash
stacksolo deploy
\`\`\`

This creates:
- Cloud SQL PostgreSQL instance
- Cloud Functions API
- Cloud Storage for frontend
- Load balancer with SSL
`;

export const apiStarterTemplate = `# api-starter Template

Simple Express API ready to extend. Minimal boilerplate for building serverless APIs.

## What's Included

- Express server on Cloud Functions
- Health check endpoint
- Echo endpoint for testing
- TypeScript + tsup build

## Quick Start

\`\`\`bash
stacksolo init --template api-starter
cd my-app
npm install
npm run dev
\`\`\`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| POST | /api/echo | Echo back request body |

## Adding Endpoints

\`\`\`typescript
// Add to functions/api/src/index.ts

app.get('/api/users', async (req, res) => {
  // Your logic here
  res.json({ users: [] });
});
\`\`\`
`;

export const staticSiteTemplate = `# static-site Template

React static site with Vite. Deploys to Cloud Storage with CDN.

## What's Included

- React + Vite setup
- TypeScript configured
- Basic routing
- Optimized production build

## Quick Start

\`\`\`bash
stacksolo init --template static-site
cd my-app
npm install
npm run dev
\`\`\`

## Deployment

\`\`\`bash
npm run build
stacksolo deploy
\`\`\`

Creates Cloud Storage bucket with CDN for fast global delivery.
`;

export const saasStarterTemplate = `# saas-starter Template

Complete SaaS foundation with Firebase Auth, Stripe billing, PostgreSQL database, and Vue 3 frontend. Everything you need to launch a subscription-based product.

## What's Included

**Frontend (Vue 3):**
- Firebase SDK for authentication (email/password, Google)
- Pinia stores for auth and subscription state
- Vue Router with protected routes
- Tailwind CSS styling
- Landing page with pricing
- Dashboard, Settings, Billing pages
- Stripe checkout and customer portal integration

**Backend:**
- Express API on Cloud Functions
- Drizzle ORM with PostgreSQL
- User and Subscription repositories
- Stripe integration (checkout, portal, webhooks)
- Webhook handler for subscription events

## Quick Start

\`\`\`bash
# Create project
stacksolo init --template saas-starter

# Install dependencies
cd my-app
npm install

# Set up Stripe secrets (get from Stripe Dashboard)
echo "sk_test_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-

# Start local development
stacksolo dev
\`\`\`

## Project Structure

\`\`\`
├── apps/web/                    # Vue 3 frontend
│   └── src/
│       ├── components/
│       │   ├── layout/          # Navbar, DashboardLayout
│       │   └── ...
│       ├── composables/
│       │   ├── useAuth.ts       # Firebase auth composable
│       │   └── useSubscription.ts
│       ├── stores/
│       │   ├── auth.ts          # Pinia auth store
│       │   └── subscription.ts
│       ├── pages/
│       │   ├── Landing.vue
│       │   ├── Login.vue
│       │   ├── Signup.vue
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
\`\`\`

## Database Schema

\`\`\`typescript
// users table - synced from Firebase Auth
export const users = pgTable('users', {
  id: varchar('id', { length: 128 }).primaryKey(),  // Firebase UID
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
});

// subscriptions table - synced from Stripe
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
\`\`\`

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
3. **Update price IDs** in \`services/stripe.service.ts\`:
\`\`\`typescript
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
\`\`\`
4. **Create secrets**:
\`\`\`bash
echo "sk_test_xxx" | gcloud secrets create stripe-secret-key --data-file=-
echo "whsec_xxx" | gcloud secrets create stripe-webhook-secret --data-file=-
\`\`\`

## Stripe Webhook Events

The webhook handler processes:
- \`checkout.session.completed\` - Create subscription after checkout
- \`customer.subscription.created\` - New subscription
- \`customer.subscription.updated\` - Subscription changes
- \`customer.subscription.deleted\` - Cancellation
- \`invoice.payment_failed\` - Failed payment

## Frontend Pages

| Route | Page | Auth Required |
|-------|------|---------------|
| \`/\` | Landing with pricing | No |
| \`/login\` | Email + Google login | No |
| \`/signup\` | Email + Google signup | No |
| \`/dashboard\` | User dashboard | Yes |
| \`/settings\` | Profile settings | Yes |
| \`/billing\` | Subscription management | Yes |

## Customization

### Adding Features

Common additions:
- **Teams/Organizations** - Add team tables and invite flow
- **Usage Limits** - Track feature usage per plan
- **Admin Dashboard** - Add admin-only routes
- **Email Notifications** - Integrate Resend or SendGrid

### Adding New API Routes

\`\`\`typescript
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
\`\`\`

## Deployment

\`\`\`bash
# Deploy everything
stacksolo deploy

# After deployment, set up Stripe webhook in Dashboard:
# URL: https://your-domain.com/api/webhooks/stripe
# Events: checkout.session.completed, customer.subscription.*
\`\`\`

## Environment Variables

For local development, create \`.env.local\`:
\`\`\`env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
\`\`\`
`;

export function getTemplateGuide(templateId: string): string | null {
  switch (templateId) {
    case 'firebase-app':
      return firebaseAppTemplate;
    case 'firebase-postgres':
      return firebasePostgresTemplate;
    case 'api-starter':
      return apiStarterTemplate;
    case 'static-site':
      return staticSiteTemplate;
    case 'saas-starter':
      return saasStarterTemplate;
    default:
      return null;
  }
}
