/**
 * Firestore client that auto-connects to emulator in local dev
 */

import { env } from './env';

// Use any for the instance type since firebase-admin is optional
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let firestoreInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminModule: any = null;

/**
 * Get Firestore instance
 * Automatically connects to emulator when FIRESTORE_EMULATOR_HOST is set
 * @returns firebase-admin Firestore instance
 */
export async function firestore(): Promise<ReturnType<typeof import('firebase-admin').firestore>> {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  // Dynamic import to make firebase-admin optional (ESM-compatible)
  if (!adminModule) {
    adminModule = await import('firebase-admin').then(m => m.default || m);
  }

  // Initialize app if not already done
  if (adminModule.apps.length === 0) {
    adminModule.initializeApp({
      projectId: env.gcpProjectId || 'demo-stacksolo',
    });
  }

  firestoreInstance = adminModule.firestore();

  // Log emulator connection in dev
  if (env.isLocal && env.firestoreEmulatorHost) {
    console.log(`[StackSolo] Firestore connected to emulator: ${env.firestoreEmulatorHost}`);
  }

  return firestoreInstance;
}

/**
 * Reset the Firestore instance (useful for testing)
 */
export function resetFirestore(): void {
  firestoreInstance = null;
}
