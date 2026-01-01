/**
 * Environment configuration for StackSolo applications
 * Auto-detects local vs production environment
 */

export interface StackSoloEnv {
  // Environment detection
  isLocal: boolean;
  isProduction: boolean;
  nodeEnv: string;

  // Gateway URL for inter-service calls
  gatewayUrl: string;

  // Emulator hosts (only set in local dev)
  firestoreEmulatorHost: string | undefined;
  firebaseAuthEmulatorHost: string | undefined;
  pubsubEmulatorHost: string | undefined;

  // Project info
  projectName: string;
  gcpProjectId: string;

  // Get any env var with optional default
  get(key: string, defaultValue?: string): string | undefined;

  // Get required env var (throws if missing)
  require(key: string): string;
}

class Env implements StackSoloEnv {
  get isLocal(): boolean {
    return (
      process.env.NODE_ENV === 'development' ||
      !!process.env.FIRESTORE_EMULATOR_HOST
    );
  }

  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  }

  get gatewayUrl(): string {
    return process.env.GATEWAY_URL || 'http://gateway:8000';
  }

  get firestoreEmulatorHost(): string | undefined {
    return process.env.FIRESTORE_EMULATOR_HOST;
  }

  get firebaseAuthEmulatorHost(): string | undefined {
    return process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }

  get pubsubEmulatorHost(): string | undefined {
    return process.env.PUBSUB_EMULATOR_HOST;
  }

  get projectName(): string {
    return process.env.STACKSOLO_PROJECT_NAME || '';
  }

  get gcpProjectId(): string {
    return process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
  }

  get(key: string, defaultValue?: string): string | undefined {
    return process.env[key] ?? defaultValue;
  }

  require(key: string): string {
    const value = process.env[key];
    if (value === undefined) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }
}

export const env = new Env();
