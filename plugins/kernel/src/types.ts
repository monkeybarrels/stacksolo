/**
 * Kernel Plugin Types
 */

export interface KernelConfig {
  /** Resource name for references (@kernel/<name>) */
  name: string;
  /** GCP region (defaults to project region) */
  location?: string;
  /** CPU allocation (default: 1) */
  cpu?: number;
  /** Memory allocation (default: '512Mi') */
  memory?: string;
  /** Firebase project for auth token validation */
  firebaseProjectId: string;
  /** GCS bucket for file uploads */
  storageBucket: string;
  /** Service account emails allowed to invoke NATS handlers */
  allowedCallers?: string[];
}

export interface KernelOutputs {
  /** Base Cloud Run URL */
  url: string;
  /** Auth endpoint URL (${url}/auth) */
  authUrl: string;
  /** NATS connection URL */
  natsUrl: string;
}