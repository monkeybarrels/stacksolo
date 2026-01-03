/**
 * GCP Kernel Plugin Types
 */

export interface GcpKernelConfig {
  name: string;
  memory?: string;
  cpu?: string;
  minInstances?: number;
  maxInstances?: number;
  firebaseProjectId: string;
  storageBucket: string;
  eventRetentionDays?: number;
}

export interface GcpKernelOutputs {
  url: string;
  serviceAccount: string;
  eventsTopic: string;
}
