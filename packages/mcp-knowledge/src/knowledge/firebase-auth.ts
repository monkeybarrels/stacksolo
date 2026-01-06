/**
 * Firebase Auth Knowledge
 *
 * Documentation for setting up Firebase Auth with StackSolo
 */

export const firebaseAuthOverview = `
# Firebase Authentication with StackSolo

StackSolo provides built-in support for Firebase Authentication through the \`@stacksolo/runtime\` package.

## Quick Start

Use the firebase-app template:
\`\`\`bash
stacksolo init --template firebase-app
\`\`\`

This creates a full-stack app with:
- React frontend with login/signup
- Cloud Function API with auth middleware
- Firestore integration
- Auto-connect to emulators in dev

## How It Works

### Client Side (Frontend)
The frontend uses Firebase SDK directly:
\`\`\`typescript
import { auth } from './firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

// Sign in
await signInWithEmailAndPassword(auth, email, password);

// Get ID token for API calls
const token = await auth.currentUser?.getIdToken();
\`\`\`

### Server Side (API)
The API uses \`@stacksolo/runtime\` for token validation:
\`\`\`typescript
import { kernel } from '@stacksolo/runtime';

// Protect all routes under /api
app.use('/api', kernel.authMiddleware());

// Access user info in routes
app.get('/api/profile', (req, res) => {
  const user = req.user;  // { uid, email, ... }
  res.json({ userId: user.uid });
});
\`\`\`

## Development with Emulators

StackSolo automatically spins up Firebase emulators in dev mode:
- Auth emulator: localhost:9099
- Firestore emulator: localhost:8080
- Emulator UI: localhost:4000

The frontend auto-connects to emulators when \`import.meta.env.DEV\` is true.
`;

export const kernelAuthReference = `
# Kernel Auth Reference

The \`@stacksolo/runtime\` package provides authentication utilities.

## kernel.authMiddleware()

Express middleware that validates Firebase ID tokens.

\`\`\`typescript
import { kernel } from '@stacksolo/runtime';

// Protect routes
app.use('/api', kernel.authMiddleware());

// Access user in route handlers
app.get('/api/protected', (req, res) => {
  // req.user is set by the middleware
  const { uid, email, email_verified, name } = req.user;
  res.json({ message: \`Hello \${email}\` });
});
\`\`\`

**User Object Properties:**
| Property | Type | Description |
|----------|------|-------------|
| uid | string | Firebase user ID |
| email | string? | User's email |
| email_verified | boolean? | Whether email is verified |
| name | string? | Display name |
| picture | string? | Profile photo URL |

## kernel.validateToken()

Direct token validation without middleware.

\`\`\`typescript
import { kernel } from '@stacksolo/runtime';

const result = await kernel.validateToken(idToken);
if (result.valid) {
  console.log('User ID:', result.uid);
  console.log('Email:', result.email);
} else {
  console.log('Invalid token:', result.error);
}
\`\`\`

**Response:**
\`\`\`typescript
interface ValidateTokenResponse {
  valid: boolean;
  uid?: string;
  email?: string;
  claims?: Record<string, unknown>;
  error?: string;
}
\`\`\`

## firestore()

Get a Firestore instance (auto-connects to emulator in dev).

\`\`\`typescript
import { firestore } from '@stacksolo/runtime';

const db = firestore();
const userDoc = await db.collection('users').doc(uid).get();
\`\`\`
`;

export const firebaseEmulatorConfig = `
# Firebase Emulator Configuration

## Enabling Emulators

Add to your stacksolo.config.json:
\`\`\`json
{
  "project": {
    "firebaseEmulators": {
      "enabled": true
    }
  }
}
\`\`\`

## Emulator Ports

| Emulator | Port | Description |
|----------|------|-------------|
| Auth | 9099 | Authentication |
| Firestore | 8080 | Database |
| UI | 4000 | Emulator dashboard |

## Frontend Auto-Connect

The firebase-app template includes auto-detection:
\`\`\`typescript
// src/firebase.ts
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}
\`\`\`

## Backend Emulator Connection

The runtime auto-connects to FIRESTORE_EMULATOR_HOST if set:
\`\`\`typescript
// Set automatically by stacksolo dev
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
\`\`\`
`;
