---
title: Firebase App Template
description: Full-stack app with Firebase Auth and Firestore
---

Full-stack app with Firebase Authentication and Firestore. The simplest way to get started with StackSolo.

## Quick Start

```bash
# Create project
stacksolo init --template firebase-app

# Install dependencies
cd my-app
npm install

# Start development
npm run dev
```

## What's Included

### Frontend (React or Vue)
- Firebase SDK initialization with emulator detection
- Auth context/composable with login, signup, logout
- Google sign-in support
- Protected routes
- Dashboard component

### Backend
- Express API on Cloud Functions
- `kernel.authMiddleware()` for protected routes
- Profile endpoint that syncs with Firestore

## Project Structure

```
├── apps/web/              # React or Vue frontend
│   └── src/
│       ├── firebase.ts    # SDK init + emulator detection
│       ├── contexts/      # AuthContext (React)
│       ├── composables/   # useAuth (Vue)
│       └── components/    # Login, Signup, Dashboard

├── functions/api/         # Express API
│   └── src/
│       └── index.ts       # Protected endpoints

└── stacksolo.config.json  # Infrastructure config
```

## Development

The template auto-detects Firebase emulators in development:

```typescript
// Automatically connects to emulators when VITE runs in dev mode
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

Start emulators:

```bash
firebase emulators:start --only auth,firestore
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check (public) |
| GET | /api/profile | Get/create user profile (protected) |

## Deployment

```bash
stacksolo deploy
```

This creates:
- Cloud Functions API
- Firestore database
- Cloud Storage for frontend
- Load balancer with SSL
