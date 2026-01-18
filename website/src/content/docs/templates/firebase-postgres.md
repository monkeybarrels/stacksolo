---
title: Firebase + PostgreSQL Template
description: Firebase Auth for authentication + Cloud SQL PostgreSQL for data
---

Firebase Auth for authentication + Cloud SQL PostgreSQL for data. Uses Drizzle ORM with repository pattern.

## When to Use This

Choose this template when:
- You want Firebase's easy authentication
- But need a relational database (not Firestore)
- You want type-safe SQL with Drizzle ORM
- You prefer the repository pattern for data access

## Quick Start

```bash
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
```

## What's Included

### Frontend (React)
- Firebase SDK initialization (Auth only, no Firestore)
- Auth context with login, signup, logout, Google sign-in
- Protected routes
- Dashboard with CRUD for items

### Backend
- Express API on Cloud Functions
- `@stacksolo/runtime` with `kernel.authMiddleware()` for Firebase token verification
- Drizzle ORM for type-safe PostgreSQL access
- Repository pattern (one repository per table)
- Pre-built migrations

## Project Structure

```
├── apps/web/                    # React frontend
│   └── src/
│       ├── firebase.ts          # Auth only (no Firestore)
│       ├── contexts/AuthContext.tsx
│       └── components/
│           ├── Login.tsx
│           ├── Signup.tsx
│           └── Dashboard.tsx    # Shows items from PostgreSQL

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

├── drizzle/                     # Generated migrations
│   └── 0000_initial.sql

└── stacksolo.config.json
```

## Auth Flow

1. **Frontend:** User signs in via Firebase Auth SDK
2. **Frontend:** Gets ID token with `user.getIdToken()`
3. **Frontend:** Sends token in `Authorization: Bearer <token>` header
4. **Backend:** `kernel.authMiddleware()` verifies token with Firebase Admin SDK
5. **Backend:** Populates `req.user` with `{ uid, email, ... }`

```typescript
// Backend: Protected route with kernel middleware
import { kernel } from '@stacksolo/runtime';

app.use('/api', kernel.authMiddleware());

app.get('/api/profile', async (req, res) => {
  // req.user is populated from the verified Firebase token
  const { uid, email } = req.user!;
  const profile = await userRepository.findOrCreate(uid, email);
  res.json(profile);
});
```

## Repository Pattern

Each table gets its own repository with typed methods:

```typescript
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
```

## Database Schema

```typescript
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
```

## Adding New Tables

1. **Add schema** in `db/schema.ts`
2. **Create repository** in `repositories/`
3. **Export** from `repositories/index.ts`
4. **Generate migration**: `npm run generate --prefix functions/api`
5. **Run migration**: `npm run migrate`

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

```bash
stacksolo deploy
```

This creates:
- Cloud SQL PostgreSQL instance
- Cloud Functions API
- Cloud Storage for frontend
- Load balancer with SSL
