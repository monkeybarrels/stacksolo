/**
 * Firebase Admin SDK Service
 *
 * Handles Firebase initialization and token validation.
 * Supports cross-project setups where Firebase Auth is in a different project than GCP resources.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';

let initialized = false;
let firebaseProjectId: string | undefined;
let isCrossProject = false;
let oauth2Client: OAuth2Client | undefined;

/**
 * Initialize Firebase Admin SDK
 *
 * When FIREBASE_PROJECT_ID differs from GCP_PROJECT_ID (cross-project setup),
 * we use google-auth-library to verify tokens directly without audience checking
 * against the service account's project.
 */
export function initializeFirebase(): void {
  if (initialized) return;

  firebaseProjectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID;
  const gcpProjectId = process.env.GCP_PROJECT_ID;

  if (!firebaseProjectId) {
    console.warn('FIREBASE_PROJECT_ID not set, auth validation will fail');
    return;
  }

  // Check if this is a cross-project setup
  isCrossProject = firebaseProjectId !== gcpProjectId;

  if (isCrossProject) {
    console.log(`Cross-project setup detected: Firebase=${firebaseProjectId}, GCP=${gcpProjectId}`);
    console.log('Using direct token verification for cross-project auth');
    // Initialize OAuth2Client for direct token verification
    oauth2Client = new OAuth2Client();
  }

  try {
    admin.initializeApp({
      projectId: firebaseProjectId,
    });

    // Configure Firestore to ignore undefined values
    // This prevents errors when documents have optional fields
    const db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });

    initialized = true;
    console.log(`Firebase Admin initialized for project: ${firebaseProjectId}`);
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
  }
}

/**
 * Get the Firebase project ID
 */
export function getFirebaseProjectId(): string | undefined {
  return firebaseProjectId;
}

/**
 * Validate a Firebase ID token
 *
 * In cross-project setups, we verify the token directly using Google's public keys
 * and manually check the audience matches the Firebase project.
 */
export async function validateToken(token: string): Promise<{
  valid: boolean;
  uid?: string;
  email?: string;
  claims?: Record<string, unknown>;
  error?: string;
}> {
  if (!initialized || !firebaseProjectId) {
    return { valid: false, error: 'Firebase not initialized' };
  }

  try {
    if (isCrossProject && oauth2Client) {
      // For cross-project setups, verify token directly using Google's public keys
      const ticket = await oauth2Client.verifyIdToken({
        idToken: token,
        audience: firebaseProjectId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return { valid: false, error: 'Invalid token payload' };
      }

      // Verify issuer is Firebase
      const expectedIssuers = [
        `https://securetoken.google.com/${firebaseProjectId}`,
      ];
      if (!expectedIssuers.includes(payload.iss || '')) {
        return { valid: false, error: `Invalid issuer: ${payload.iss}` };
      }

      return {
        valid: true,
        uid: payload.sub,
        email: payload.email,
        claims: {
          email_verified: payload.email_verified,
          name: payload.name,
          picture: payload.picture,
          iss: payload.iss,
          aud: payload.aud,
          sub: payload.sub,
          iat: payload.iat,
          exp: payload.exp,
        },
      };
    } else {
      // Same-project setup: use Firebase Admin SDK directly
      const decodedToken = await admin.auth().verifyIdToken(token, false);

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
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token validation failed';
    return { valid: false, error: message };
  }
}
