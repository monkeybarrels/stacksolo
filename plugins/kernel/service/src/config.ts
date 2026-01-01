/**
 * Kernel Service Configuration
 * Reads from environment variables
 */

export const config = {
  /** NATS server port */
  natsPort: parseInt(process.env.NATS_PORT || '4222', 10),

  /** HTTP server port */
  httpPort: parseInt(process.env.HTTP_PORT || '8080', 10),

  /** NATS connection URL (local server) */
  natsUrl: process.env.NATS_URL || 'nats://localhost:4222',

  /** Firebase project ID for auth validation */
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',

  /** GCS bucket for file uploads */
  gcsBucket: process.env.GCS_BUCKET || '',

  /** Comma-separated list of allowed caller service accounts */
  allowedCallers: (process.env.ALLOWED_CALLERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  /** Signed URL expiration in seconds */
  signedUrlExpiration: parseInt(process.env.SIGNED_URL_EXPIRATION || '3600', 10),
};

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const missing: string[] = [];

  if (!config.firebaseProjectId) {
    missing.push('FIREBASE_PROJECT_ID');
  }
  if (!config.gcsBucket) {
    missing.push('GCS_BUCKET');
  }

  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
  }
}