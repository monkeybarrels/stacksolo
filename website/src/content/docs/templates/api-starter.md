---
title: API Starter Template
description: Simple Express API ready to extend
---

Simple Express API ready to extend. Minimal boilerplate for building serverless APIs.

## Quick Start

```bash
# Create project
stacksolo init --template api-starter

# Install dependencies
cd my-api
npm install

# Start development
npm run dev
```

## What's Included

- Express server on Cloud Functions
- Health check endpoint
- Echo endpoint for testing
- TypeScript + tsup build

## Project Structure

```
├── functions/api/
│   └── src/
│       └── index.ts      # API routes

└── stacksolo.config.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| POST | /api/echo | Echo back request body |

## Adding Endpoints

```typescript
// Add to functions/api/src/index.ts

app.get('/api/users', async (req, res) => {
  // Your logic here
  res.json({ users: [] });
});

app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  // Create user
  res.json({ id: '123', name, email });
});
```

## Adding Authentication

To add Firebase Auth protection:

```typescript
import { kernel } from '@stacksolo/runtime';

// Protect all routes under /api/protected
app.use('/api/protected', kernel.authMiddleware());

app.get('/api/protected/profile', async (req, res) => {
  const { uid, email } = req.user!;
  res.json({ uid, email });
});
```

## Adding a Database

To add PostgreSQL:

1. Update `stacksolo.config.json`:
```json
{
  "networks": [{
    "databases": [{
      "name": "main",
      "databaseVersion": "POSTGRES_15"
    }],
    "functions": [{
      "name": "api",
      "env": {
        "DATABASE_URL": "@database/main.connectionString"
      }
    }]
  }]
}
```

2. Install Drizzle:
```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

3. Create your schema and queries

## Deployment

```bash
stacksolo deploy
```

This creates:
- Cloud Functions API
- Load balancer with SSL
