/**
 * Firebase Admin SDK Service
 *
 * Handles Firebase initialization and token validation.
 */

import admin from 'firebase-admin';

let initialized = false;

/**
 * Initialize Firebase Admin SDK
 */
export function initializeFirebase(): void {
  if (initialized) return;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID;

  if (!projectId) {
    console.warn('FIREBASE_PROJECT_ID not set, auth validation will fail');
    return;
  }

  try {
    admin.initializeApp({
      projectId,
    });
    initialized = true;
    console.log(`Firebase Admin initialized for project: ${projectId}`);
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

/**
 * Validate a Firebase ID token
 */
export async function validateToken(token: string): Promise<{
  valid: boolean;
  uid?: string;
  email?: string;
  claims?: Record<string, unknown>;
  error?: string;
}> {
  if (!initialized) {
    return { valid: false, error: 'Firebase not initialized' };
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);

    return {
      valid: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      claims: {
        email_verified: decodedToken.email_verified,
        name: decodedToken.name,
        picture: decodedToken.picture,
        ...decodedToken,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token validation failed';
    return { valid: false, error: message };
  }
}
