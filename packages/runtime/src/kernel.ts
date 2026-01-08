/**
 * Kernel client for StackSolo applications
 * Provides auth validation via HTTP and file operations via NATS
 */

import { env } from './env';

// =============================================================================
// Auth Types
// =============================================================================

export interface ValidateTokenResult {
  valid: true;
  uid: string;
  email?: string;
  claims: Record<string, unknown>;
}

export interface ValidateTokenError {
  valid: false;
  error: string;
  code: 'MISSING_TOKEN' | 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED' | 'MALFORMED_TOKEN';
}

export type ValidateTokenResponse = ValidateTokenResult | ValidateTokenError;

// =============================================================================
// Files Types (NATS)
// =============================================================================

export interface UploadUrlRequest {
  path: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  path: string;
  expiresAt: string;
}

export interface DownloadUrlRequest {
  path: string;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  path: string;
  expiresAt: string;
}

export interface ListFilesRequest {
  prefix?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface FileInfo {
  path: string;
  size: number;
  contentType: string;
  updated: string;
  metadata?: Record<string, string>;
}

export interface ListFilesResponse {
  files: FileInfo[];
  nextPageToken?: string;
}

export interface DeleteFileRequest {
  path: string;
}

export interface DeleteFileResponse {
  deleted: true;
  path: string;
}

export interface MoveFileRequest {
  sourcePath: string;
  destinationPath: string;
}

export interface MoveFileResponse {
  moved: true;
  sourcePath: string;
  destinationPath: string;
}

export interface FileMetadataRequest {
  path: string;
}

export interface FileMetadataResponse {
  path: string;
  size: number;
  contentType: string;
  created: string;
  updated: string;
  metadata?: Record<string, string>;
}

export interface KernelErrorResponse {
  error: string;
  code: string;
}

// =============================================================================
// Auth Client (HTTP + Local Firebase Admin)
// =============================================================================

// Lazy-loaded Firebase Admin for local dev
let firebaseAdminAuth: any = null;

/**
 * Initialize Firebase Admin for local token validation
 */
async function getFirebaseAuth() {
  if (firebaseAdminAuth) {
    return firebaseAdminAuth;
  }

  try {
    const admin = await import('firebase-admin');

    // Initialize if not already done
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: env.firebaseProjectId || 'demo-local',
      });
    }

    firebaseAdminAuth = admin.auth();
    return firebaseAdminAuth;
  } catch {
    throw new Error(
      'firebase-admin is required for local token validation. Install it with: npm install firebase-admin'
    );
  }
}

/**
 * Validate token locally using Firebase Admin SDK
 */
async function validateTokenLocally(token: string): Promise<ValidateTokenResponse> {
  try {
    const auth = await getFirebaseAuth();
    const decodedToken = await auth.verifyIdToken(token);

    return {
      valid: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      claims: decodedToken,
    };
  } catch (error: any) {
    // Map Firebase errors to our error codes
    let code: ValidateTokenError['code'] = 'INVALID_TOKEN';

    if (error.code === 'auth/id-token-expired') {
      code = 'TOKEN_EXPIRED';
    } else if (error.code === 'auth/id-token-revoked') {
      code = 'TOKEN_REVOKED';
    } else if (error.code === 'auth/argument-error') {
      code = 'MALFORMED_TOKEN';
    }

    return {
      valid: false,
      error: error.message || 'Token validation failed',
      code,
    };
  }
}

/**
 * Validate a Firebase ID token via the kernel
 *
 * In local development (when FIRESTORE_EMULATOR_HOST is set), validates
 * directly using Firebase Admin SDK against the Auth emulator.
 * In production, calls the kernel service.
 *
 * @param token - Firebase ID token from client
 * @returns Validation result with user info or error
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * const result = await kernel.validateToken(req.headers.authorization);
 * if (result.valid) {
 *   console.log('User ID:', result.uid);
 *   console.log('Email:', result.email);
 * } else {
 *   console.log('Invalid token:', result.code);
 * }
 * ```
 */
export async function validateToken(token: string): Promise<ValidateTokenResponse> {
  // Strip "Bearer " prefix if present
  const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

  // In local dev, validate directly using Firebase Admin SDK
  // This avoids needing to run the kernel locally
  if (env.isLocal) {
    return validateTokenLocally(cleanToken);
  }

  // In production, call the kernel
  const response = await fetch(`${env.kernelAuthUrl}/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: cleanToken }),
  });

  const data = await response.json();
  return data as ValidateTokenResponse;
}

/**
 * Express middleware for validating Firebase tokens
 *
 * Adds `req.user` with uid, email, and claims if valid.
 * Returns 401 if token is invalid or missing.
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * app.use('/api', kernel.authMiddleware());
 *
 * app.get('/api/me', (req, res) => {
 *   res.json({ uid: req.user.uid });
 * });
 * ```
 */
export function authMiddleware() {
  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authorization header required',
        code: 'MISSING_TOKEN',
      });
    }

    const result = await validateToken(authHeader);

    if (!result.valid) {
      return res.status(401).json({
        error: result.error,
        code: result.code,
      });
    }

    // Attach user to request
    req.user = {
      uid: result.uid,
      email: result.email,
      claims: result.claims,
    };

    next();
  };
}

// =============================================================================
// NATS Client
// =============================================================================

// Lazy-loaded NATS connection
let natsConnection: any = null;
let natsConnecting: Promise<any> | null = null;

/**
 * Get or create NATS connection to kernel
 */
async function getNatsConnection() {
  if (natsConnection) {
    return natsConnection;
  }

  if (natsConnecting) {
    return natsConnecting;
  }

  natsConnecting = (async () => {
    try {
      const { connect } = await import('nats');
      natsConnection = await connect({
        servers: env.natsUrl,
        name: `${env.projectName}-client`,
      });

      // Handle connection close
      natsConnection.closed().then(() => {
        natsConnection = null;
        natsConnecting = null;
      });

      return natsConnection;
    } catch {
      natsConnecting = null;
      throw new Error(
        'nats package is required for kernel NATS features. Install it with: npm install nats'
      );
    }
  })();

  return natsConnecting;
}

/**
 * Make a request to the kernel via NATS
 *
 * @param subject - NATS subject (e.g., 'kernel.files.upload-url')
 * @param data - Request data
 * @param timeout - Timeout in milliseconds (default: 5000)
 */
async function natsRequest<T>(subject: string, data: unknown, timeout = 5000): Promise<T> {
  const nc = await getNatsConnection();
  const { StringCodec } = await import('nats');
  const sc = StringCodec();

  const response = await nc.request(subject, sc.encode(JSON.stringify(data)), { timeout });
  const decoded = JSON.parse(sc.decode(response.data));

  // Check for error response
  if (decoded.error && decoded.code) {
    throw new KernelError(decoded.error, decoded.code);
  }

  return decoded as T;
}

/**
 * Kernel-specific error class
 */
export class KernelError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
  }
}

// =============================================================================
// Files Client (NATS)
// =============================================================================

/**
 * Get a signed upload URL for a file
 *
 * @param path - File path in the bucket (e.g., 'users/123/avatar.png')
 * @param contentType - MIME type of the file
 * @param metadata - Optional metadata to attach to the file
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * const { uploadUrl, expiresAt } = await kernel.files.getUploadUrl(
 *   'users/123/avatar.png',
 *   'image/png'
 * );
 *
 * // Client uses uploadUrl to PUT the file directly to GCS
 * ```
 */
async function getUploadUrl(
  path: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<UploadUrlResponse> {
  return natsRequest<UploadUrlResponse>('kernel.files.upload-url', {
    path,
    contentType,
    metadata,
  });
}

/**
 * Get a signed download URL for a file
 *
 * @param path - File path in the bucket
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * const { downloadUrl } = await kernel.files.getDownloadUrl('users/123/avatar.png');
 *
 * // Return URL to client for direct download
 * ```
 */
async function getDownloadUrl(path: string): Promise<DownloadUrlResponse> {
  return natsRequest<DownloadUrlResponse>('kernel.files.download-url', { path });
}

/**
 * List files in the bucket
 *
 * @param options - List options (prefix, maxResults, pageToken)
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * // List all files in a user's folder
 * const { files, nextPageToken } = await kernel.files.list({
 *   prefix: 'users/123/',
 *   maxResults: 50,
 * });
 *
 * // Paginate through results
 * if (nextPageToken) {
 *   const nextPage = await kernel.files.list({
 *     prefix: 'users/123/',
 *     pageToken: nextPageToken,
 *   });
 * }
 * ```
 */
async function listFiles(options: ListFilesRequest = {}): Promise<ListFilesResponse> {
  return natsRequest<ListFilesResponse>('kernel.files.list', options);
}

/**
 * Delete a file from the bucket
 *
 * @param path - File path in the bucket
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * await kernel.files.delete('users/123/old-avatar.png');
 * ```
 */
async function deleteFile(path: string): Promise<DeleteFileResponse> {
  return natsRequest<DeleteFileResponse>('kernel.files.delete', { path });
}

/**
 * Move or rename a file in the bucket
 *
 * @param sourcePath - Current file path
 * @param destinationPath - New file path
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * // Rename a file
 * await kernel.files.move(
 *   'users/123/avatar.png',
 *   'users/123/profile-picture.png'
 * );
 *
 * // Move to different folder
 * await kernel.files.move(
 *   'uploads/temp/file.pdf',
 *   'documents/reports/2024/file.pdf'
 * );
 * ```
 */
async function moveFile(sourcePath: string, destinationPath: string): Promise<MoveFileResponse> {
  return natsRequest<MoveFileResponse>('kernel.files.move', { sourcePath, destinationPath });
}

/**
 * Get metadata for a file
 *
 * @param path - File path in the bucket
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * const metadata = await kernel.files.getMetadata('users/123/avatar.png');
 * console.log('Size:', metadata.size);
 * console.log('Content-Type:', metadata.contentType);
 * console.log('Created:', metadata.created);
 * ```
 */
async function getFileMetadata(path: string): Promise<FileMetadataResponse> {
  return natsRequest<FileMetadataResponse>('kernel.files.metadata', { path });
}

/**
 * Files client for file operations via NATS
 */
export const files = {
  getUploadUrl,
  getDownloadUrl,
  list: listFiles,
  delete: deleteFile,
  move: moveFile,
  getMetadata: getFileMetadata,
};

// =============================================================================
// Events Client (NATS JetStream + HTTP Push)
// =============================================================================

export interface PublishEventResponse {
  published: true;
  eventType: string;
  seq: number;
  timestamp: string;
}

export interface RegisterSubscriptionOptions {
  /** Event pattern (e.g., 'user.created', 'order.*', 'payment.>') */
  pattern: string;
  /** HTTP endpoint to receive events */
  endpoint: string;
  /** Service name for tracking */
  serviceName?: string;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Retry delay in ms (default: 1000) */
  retryDelayMs?: number;
}

export interface RegisterSubscriptionResponse {
  subscribed: true;
  subscriptionId: string;
  pattern: string;
  endpoint: string;
}

export interface SubscriptionInfo {
  subscriptionId: string;
  pattern: string;
  endpoint: string;
  serviceName?: string;
  createdAt: string;
  deliveredCount: number;
  failedCount: number;
}

export interface EventPayload {
  type: string;
  data: unknown;
  metadata?: Record<string, string>;
  timestamp: string;
  seq?: number;
}

/**
 * Publish an event to the kernel's event stream (JetStream)
 *
 * Events are stored durably and delivered to all registered subscribers.
 *
 * @param eventType - Event type (e.g., 'user.created', 'order.placed')
 * @param data - Event payload
 * @param metadata - Optional metadata
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * const result = await kernel.events.publish('user.created', {
 *   userId: '123',
 *   email: 'user@example.com',
 * });
 * console.log('Event sequence:', result.seq);
 * ```
 */
async function publishEvent(
  eventType: string,
  data: unknown,
  metadata?: Record<string, string>
): Promise<PublishEventResponse> {
  return natsRequest<PublishEventResponse>('kernel.events.publish', {
    eventType,
    data,
    metadata,
  });
}

/**
 * Register an HTTP endpoint to receive events (for functions/serverless)
 *
 * The kernel will push events to your HTTP endpoint when they occur.
 * This is the recommended approach for Cloud Functions and serverless.
 *
 * @param options - Subscription options
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * // Register at function startup
 * const sub = await kernel.events.registerSubscription({
 *   pattern: 'user.created',
 *   endpoint: 'https://my-function.run.app/events',
 *   serviceName: 'user-notifications',
 * });
 *
 * // Your endpoint receives POST requests with event payload:
 * // {
 * //   type: 'user.created',
 * //   data: { userId: '123', email: '...' },
 * //   timestamp: '2024-01-01T00:00:00Z',
 * //   seq: 42
 * // }
 * ```
 */
async function registerSubscription(
  options: RegisterSubscriptionOptions
): Promise<RegisterSubscriptionResponse> {
  return natsRequest<RegisterSubscriptionResponse>('kernel.events.subscribe', options);
}

/**
 * Remove an HTTP subscription
 *
 * @param subscriptionId - ID returned from registerSubscription
 *
 * @example
 * ```ts
 * await kernel.events.unregisterSubscription(sub.subscriptionId);
 * ```
 */
async function unregisterSubscription(subscriptionId: string): Promise<{ unsubscribed: true }> {
  return natsRequest<{ unsubscribed: true }>('kernel.events.unsubscribe', { subscriptionId });
}

/**
 * List active HTTP subscriptions
 *
 * @param pattern - Optional pattern filter
 */
async function listSubscriptions(pattern?: string): Promise<{ subscriptions: SubscriptionInfo[] }> {
  return natsRequest<{ subscriptions: SubscriptionInfo[] }>('kernel.events.list-subscriptions', {
    pattern,
  });
}

/**
 * Subscribe to events via NATS (for always-on containers)
 *
 * This creates a direct NATS subscription. Only use this for services
 * that maintain a persistent connection (containers, long-running processes).
 *
 * For serverless/functions, use `registerSubscription` instead.
 *
 * @param eventType - Event type pattern (e.g., 'user.*', 'order.placed')
 * @param handler - Callback function for each event
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * // For containers only
 * const sub = await kernel.events.subscribe('user.*', (event) => {
 *   console.log('User event:', event.type, event.data);
 * });
 *
 * // Later: sub.unsubscribe();
 * ```
 */
async function subscribeToEvents(
  eventType: string,
  handler: (event: EventPayload) => void
): Promise<{ unsubscribe: () => void }> {
  const nc = await getNatsConnection();
  const { StringCodec } = await import('nats');
  const sc = StringCodec();

  const subject = `kernel.events.${eventType}`;
  const sub = nc.subscribe(subject, {
    callback: (_err: Error | null, msg: { data: Uint8Array }) => {
      try {
        const event = JSON.parse(sc.decode(msg.data));
        handler(event);
      } catch {
        // Ignore malformed events
      }
    },
  });

  return {
    unsubscribe: () => sub.unsubscribe(),
  };
}

/**
 * Events client for pub/sub operations
 *
 * Two subscription patterns:
 * - `subscribe()` - Direct NATS subscription (containers only)
 * - `registerSubscription()` - HTTP push delivery (functions/serverless)
 */
export const events = {
  publish: publishEvent,
  subscribe: subscribeToEvents,
  registerSubscription,
  unregisterSubscription,
  listSubscriptions,
};

// =============================================================================
// Connection Management
// =============================================================================

/**
 * Close the NATS connection
 * Call this during graceful shutdown
 */
export async function closeConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.close();
    natsConnection = null;
    natsConnecting = null;
  }
}

/**
 * Check if connected to the kernel's NATS
 */
export function isConnected(): boolean {
  return natsConnection !== null && !natsConnection.isClosed();
}

// =============================================================================
// Kernel Extension System
// =============================================================================

/**
 * Registry for kernel extensions added by plugins
 */
const kernelExtensions = new Map<string, unknown>();

/**
 * Register a kernel extension
 *
 * Plugins call this to add their methods to the kernel namespace.
 * Users can then access them via `kernel.<namespace>.<method>()`.
 *
 * @param namespace - Extension namespace (e.g., 'access', 'payments')
 * @param extension - Object containing the extension methods
 *
 * @example
 * ```ts
 * // In plugin (e.g., zero-trust-auth)
 * import { extendKernel } from '@stacksolo/runtime';
 *
 * extendKernel('access', {
 *   check: async (resource, member, permission) => { ... },
 *   grant: async (resource, member, permissions, grantedBy) => { ... },
 *   revoke: async (resource, member, revokedBy) => { ... },
 *   list: async (resource) => { ... },
 * });
 *
 * // In user code
 * import { kernel } from '@stacksolo/runtime';
 *
 * const result = await kernel.access.check('admin-dashboard', userEmail, 'read');
 * ```
 */
export function extendKernel<T extends object>(namespace: string, extension: T): void {
  if (kernelExtensions.has(namespace)) {
    console.warn(`Kernel extension '${namespace}' is being overwritten`);
  }
  kernelExtensions.set(namespace, extension);
}

/**
 * Get a kernel extension by namespace
 *
 * @param namespace - Extension namespace
 * @returns The extension object or undefined if not registered
 */
export function getKernelExtension<T = unknown>(namespace: string): T | undefined {
  return kernelExtensions.get(namespace) as T | undefined;
}

/**
 * Check if a kernel extension is registered
 */
export function hasKernelExtension(namespace: string): boolean {
  return kernelExtensions.has(namespace);
}

/**
 * List all registered kernel extension namespaces
 */
export function getKernelExtensions(): string[] {
  return Array.from(kernelExtensions.keys());
}

// =============================================================================
// Kernel Export
// =============================================================================

/**
 * Base kernel object with core methods
 */
const kernelBase = {
  // Auth (HTTP)
  validateToken,
  authMiddleware,

  // Files (NATS)
  files,

  // Events (NATS)
  events,

  // Connection
  closeConnection,
  isConnected,

  // Extension management
  extend: extendKernel,
  getExtension: getKernelExtension,
  hasExtension: hasKernelExtension,
  listExtensions: getKernelExtensions,
};

/**
 * Kernel client for StackSolo applications
 *
 * Provides core functionality (auth, files, events) plus
 * extension namespaces added by plugins.
 *
 * @example Core usage:
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 *
 * // Auth
 * const result = await kernel.validateToken(token);
 *
 * // Files
 * const { uploadUrl } = await kernel.files.getUploadUrl('path/to/file', 'image/png');
 *
 * // Events
 * await kernel.events.publish('user.created', { userId: '123' });
 * ```
 *
 * @example With extensions (added by plugins):
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 * import '@stacksolo/plugin-zero-trust-auth/runtime'; // Registers kernel.access
 *
 * // Access control (from zero-trust-auth)
 * const { hasAccess } = await kernel.access.check('admin', userEmail, 'read');
 * await kernel.access.grant('admin', 'bob@example.com', ['read'], currentUser);
 * ```
 */
export const kernel: typeof kernelBase & Record<string, unknown> = new Proxy(kernelBase, {
  get(target, prop: string) {
    // Return base property if it exists
    if (prop in target) {
      return (target as Record<string, unknown>)[prop];
    }

    // Check for extension
    const extension = kernelExtensions.get(prop);
    if (extension !== undefined) {
      return extension;
    }

    // Return undefined for unknown properties
    return undefined;
  },

  has(target, prop: string) {
    return prop in target || kernelExtensions.has(prop);
  },

  ownKeys(target) {
    return [...Object.keys(target), ...kernelExtensions.keys()];
  },

  getOwnPropertyDescriptor(target, prop: string) {
    if (prop in target) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    if (kernelExtensions.has(prop)) {
      return {
        configurable: true,
        enumerable: true,
        value: kernelExtensions.get(prop),
      };
    }
    return undefined;
  },
});
