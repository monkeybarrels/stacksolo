/**
 * Kernel scaffolder
 * Generates directory structure and starter code for kernel service (HTTP + NATS)
 */

import type { StackSoloConfig, KernelConfig } from '@stacksolo/blueprint';
import type { ServiceScaffold, GeneratedFile } from '../types';

export function generateKernelScaffold(
  kernel: KernelConfig,
  config: StackSoloConfig
): ServiceScaffold {
  const servicePath = `containers/${kernel.name}`;
  const files: GeneratedFile[] = [];

  // Dockerfile
  files.push({
    path: `${servicePath}/Dockerfile`,
    content: generateDockerfile(),
  });

  // package.json
  files.push({
    path: `${servicePath}/package.json`,
    content: generatePackageJson(kernel, config),
  });

  // tsconfig.json
  files.push({
    path: `${servicePath}/tsconfig.json`,
    content: generateTsConfig(),
  });

  // start.sh
  files.push({
    path: `${servicePath}/start.sh`,
    content: generateStartScript(),
  });

  // src/index.ts
  files.push({
    path: `${servicePath}/src/index.ts`,
    content: generateEntrypoint(),
  });

  // src/config.ts
  files.push({
    path: `${servicePath}/src/config.ts`,
    content: generateConfig(),
  });

  // src/http/index.ts
  files.push({
    path: `${servicePath}/src/http/index.ts`,
    content: generateHttpIndex(),
  });

  // src/http/auth.ts
  files.push({
    path: `${servicePath}/src/http/auth.ts`,
    content: generateHttpAuth(),
  });

  // src/http/health.ts
  files.push({
    path: `${servicePath}/src/http/health.ts`,
    content: generateHttpHealth(),
  });

  // src/nats/index.ts
  files.push({
    path: `${servicePath}/src/nats/index.ts`,
    content: generateNatsIndex(),
  });

  // src/nats/files.ts
  files.push({
    path: `${servicePath}/src/nats/files.ts`,
    content: generateNatsFiles(),
  });

  // src/setup/streams.ts
  files.push({
    path: `${servicePath}/src/setup/streams.ts`,
    content: generateStreamsSetup(),
  });

  // .gitignore
  files.push({
    path: `${servicePath}/.gitignore`,
    content: generateGitignore(),
  });

  return {
    name: kernel.name,
    type: 'container',
    files,
  };
}

function generateDockerfile(): string {
  return `FROM node:20-alpine

# Install NATS server
RUN apk add --no-cache curl && \\
    curl -L https://github.com/nats-io/nats-server/releases/download/v2.10.24/nats-server-v2.10.24-linux-amd64.tar.gz | tar xz && \\
    mv nats-server-*/nats-server /usr/local/bin/ && \\
    rm -rf nats-server-* && \\
    apk del curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy compiled source
COPY dist/ ./dist/

# Copy start script
COPY start.sh ./
RUN chmod +x start.sh

# Create data directory for JetStream
RUN mkdir -p /data

# Expose ports
EXPOSE 4222 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start NATS + Node service
CMD ["./start.sh"]
`;
}

function generatePackageJson(kernel: KernelConfig, config: StackSoloConfig): string {
  const pkg = {
    name: `@${config.project.name}/${kernel.name}`,
    version: '0.1.0',
    description: 'Kernel service - HTTP + NATS hybrid',
    type: 'module',
    main: 'dist/index.js',
    scripts: {
      build: 'tsup src/index.ts --format esm --target node20 --dts',
      dev: 'tsx watch src/index.ts',
      start: 'node dist/index.js',
    },
    dependencies: {
      nats: '^2.18.0',
      'firebase-admin': '^12.0.0',
      '@google-cloud/storage': '^7.0.0',
      express: '^4.18.0',
      cors: '^2.8.5',
    },
    devDependencies: {
      '@types/express': '^4.17.21',
      '@types/cors': '^2.8.17',
      '@types/node': '^20.0.0',
      tsup: '^8.0.0',
      tsx: '^4.0.0',
      typescript: '^5.0.0',
    },
  };

  return JSON.stringify(pkg, null, 2) + '\n';
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      outDir: 'dist',
      rootDir: 'src',
      declaration: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  };

  return JSON.stringify(config, null, 2) + '\n';
}

function generateStartScript(): string {
  return `#!/bin/sh
set -e

echo "Starting NATS server..."
nats-server --jetstream --store_dir /data &
NATS_PID=$!

# Wait for NATS to be ready
echo "Waiting for NATS to start..."
sleep 2

# Check if NATS is running
if ! kill -0 $NATS_PID 2>/dev/null; then
  echo "NATS failed to start"
  exit 1
fi

echo "NATS server started (PID: $NATS_PID)"

# Start Node.js service
echo "Starting kernel service..."
exec node dist/index.js
`;
}

function generateEntrypoint(): string {
  return `/**
 * Kernel Service
 *
 * Hybrid HTTP + NATS shared infrastructure:
 * - HTTP: /auth/validate (public), /health
 * - NATS: kernel.files.*, kernel.events.* (internal)
 */

import { startHttpServer, setNatsConnection } from './http/index';
import { startNatsHandlers, closeNatsConnection } from './nats/index';
import { setupStreams } from './setup/streams';
import { config, validateConfig } from './config';

async function main(): Promise<void> {
  console.log('Starting kernel service...');

  // Validate configuration
  validateConfig();

  // Start HTTP server (auth, health)
  const http = await startHttpServer(config.httpPort);
  console.log(\`HTTP server listening on port \${config.httpPort}\`);

  // Connect to NATS and setup handlers
  const nc = await startNatsHandlers(config.natsUrl);
  setNatsConnection(nc);
  console.log(\`NATS handlers connected to \${config.natsUrl}\`);

  // Setup JetStream streams
  try {
    await setupStreams(nc);
    console.log('JetStream streams configured');
  } catch (error) {
    console.error('Failed to setup JetStream streams:', error);
    // Continue - streams might already exist or JetStream isn't enabled
  }

  console.log('Kernel service started successfully');

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(\`Received \${signal}, shutting down...\`);

    // Close NATS connection
    await closeNatsConnection();
    console.log('NATS connection closed');

    // Close HTTP server
    http.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start kernel service:', error);
  process.exit(1);
});
`;
}

function generateConfig(): string {
  return `/**
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
    console.warn(\`Warning: Missing environment variables: \${missing.join(', ')}\`);
  }
}
`;
}

function generateHttpIndex(): string {
  return `/**
 * HTTP Server
 * Express app with auth and health routes
 */

import express from 'express';
import cors from 'cors';
import type { Server } from 'http';
import type { NatsConnection } from 'nats';
import { authRouter } from './auth';
import { createHealthRouter } from './health';

let natsConnection: NatsConnection | null = null;

/**
 * Set the NATS connection for health checks
 */
export function setNatsConnection(nc: NatsConnection): void {
  natsConnection = nc;
}

/**
 * Start the HTTP server
 */
export function startHttpServer(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const app = express();

    // Middleware
    app.use(express.json());

    // CORS for auth routes (browser access)
    app.use('/auth', cors({
      origin: true,
      credentials: true,
    }));

    // Routes
    app.use('/', createHealthRouter(() => natsConnection));
    app.use('/auth', authRouter);

    // 404 handler
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error('HTTP error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });

    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
`;
}

function generateHttpAuth(): string {
  return `/**
 * Auth Routes
 * POST /auth/validate - Validate Firebase ID token
 */

import { Router } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config';

// Initialize Firebase Admin SDK once
if (getApps().length === 0) {
  initializeApp({
    projectId: config.firebaseProjectId,
  });
}

export const authRouter = Router();

interface ValidateRequest {
  token: string;
}

interface ValidateSuccessResponse {
  valid: true;
  uid: string;
  email?: string;
  claims: Record<string, unknown>;
}

interface ValidateErrorResponse {
  valid: false;
  error: string;
  code: string;
}

/**
 * POST /auth/validate
 * Validates a Firebase ID token and returns user claims
 */
authRouter.post('/validate', async (req, res) => {
  try {
    const { token } = req.body as ValidateRequest;

    if (!token) {
      const response: ValidateErrorResponse = {
        valid: false,
        error: 'Token is required',
        code: 'MISSING_TOKEN',
      };
      res.status(400).json(response);
      return;
    }

    const decodedToken = await getAuth().verifyIdToken(token);

    const response: ValidateSuccessResponse = {
      valid: true,
      uid: decodedToken.uid,
      email: decodedToken.email,
      claims: decodedToken,
    };

    res.json(response);
  } catch (error) {
    const firebaseError = error as { code?: string; message?: string };

    let code = 'INVALID_TOKEN';
    let message = 'Invalid token';

    if (firebaseError.code === 'auth/id-token-expired') {
      code = 'TOKEN_EXPIRED';
      message = 'Token has expired';
    } else if (firebaseError.code === 'auth/id-token-revoked') {
      code = 'TOKEN_REVOKED';
      message = 'Token has been revoked';
    } else if (firebaseError.code === 'auth/argument-error') {
      code = 'MALFORMED_TOKEN';
      message = 'Token is malformed';
    }

    const response: ValidateErrorResponse = {
      valid: false,
      error: message,
      code,
    };

    res.status(401).json(response);
  }
});
`;
}

function generateHttpHealth(): string {
  return `/**
 * Health Check Route
 * GET /health - Returns service health status
 */

import { Router } from 'express';
import type { NatsConnection } from 'nats';

export function createHealthRouter(getNatsConnection: () => NatsConnection | null): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const nc = getNatsConnection();
    const natsStatus = nc && !nc.isClosed() ? 'connected' : 'disconnected';

    res.json({
      status: 'ok',
      nats: natsStatus,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
`;
}

function generateNatsIndex(): string {
  return `/**
 * NATS Connection and Handlers
 */

import { connect, type NatsConnection } from 'nats';
import { config } from '../config';
import { setupFilesHandlers } from './files';

let natsConnection: NatsConnection | null = null;

/**
 * Connect to NATS server and setup handlers
 */
export async function startNatsHandlers(natsUrl: string): Promise<NatsConnection> {
  // Connect to NATS
  natsConnection = await connect({
    servers: natsUrl,
    name: 'kernel-service',
    reconnect: true,
    maxReconnectAttempts: -1, // Unlimited reconnects
    reconnectTimeWait: 1000,
  });

  console.log(\`Connected to NATS at \${natsUrl}\`);

  // Setup connection status logging
  (async () => {
    for await (const status of natsConnection!.status()) {
      console.log(\`NATS status: \${status.type}\`, status.data);
    }
  })();

  // Setup handlers
  const filesSubs = setupFilesHandlers(natsConnection);
  console.log(\`Registered \${filesSubs.length} files handlers\`);

  return natsConnection;
}

/**
 * Get the current NATS connection
 */
export function getNatsConnection(): NatsConnection | null {
  return natsConnection;
}

/**
 * Gracefully drain and close NATS connection
 */
export async function closeNatsConnection(): Promise<void> {
  if (natsConnection) {
    await natsConnection.drain();
    natsConnection = null;
  }
}
`;
}

function generateNatsFiles(): string {
  return `/**
 * Files NATS Handlers
 * kernel.files.upload-url - Generate signed upload URL
 * kernel.files.download-url - Generate signed download URL
 */

import { Storage } from '@google-cloud/storage';
import type { NatsConnection, Subscription } from 'nats';
import { StringCodec } from 'nats';
import { config } from '../config';

const storage = new Storage();
const sc = StringCodec();

interface UploadUrlRequest {
  path: string;
  contentType: string;
  metadata?: Record<string, string>;
}

interface UploadUrlResponse {
  uploadUrl: string;
  path: string;
  expiresAt: string;
}

interface DownloadUrlRequest {
  path: string;
}

interface DownloadUrlResponse {
  downloadUrl: string;
  path: string;
  expiresAt: string;
}

interface ErrorResponse {
  error: string;
  code: string;
}

/**
 * Validate file path - prevent path traversal attacks
 */
function validatePath(path: string): { valid: boolean; error?: string } {
  if (!path) {
    return { valid: false, error: 'Path is required' };
  }

  if (path.startsWith('/')) {
    return { valid: false, error: 'Path must not start with /' };
  }

  if (path.includes('..')) {
    return { valid: false, error: 'Path must not contain ..' };
  }

  if (path.includes('//')) {
    return { valid: false, error: 'Path must not contain //' };
  }

  return { valid: true };
}

/**
 * Setup files NATS handlers
 */
export function setupFilesHandlers(nc: NatsConnection): Subscription[] {
  const subscriptions: Subscription[] = [];

  // kernel.files.upload-url - Generate signed PUT URL
  const uploadSub = nc.subscribe('kernel.files.upload-url', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: UploadUrlRequest = JSON.parse(sc.decode(msg.data));

        // Validate path
        const validation = validatePath(request.path);
        if (!validation.valid) {
          const response: ErrorResponse = {
            error: validation.error!,
            code: 'INVALID_PATH',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        // Validate content type
        if (!request.contentType) {
          const response: ErrorResponse = {
            error: 'Content type is required',
            code: 'MISSING_CONTENT_TYPE',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        // Generate signed URL
        const bucket = storage.bucket(config.gcsBucket);
        const file = bucket.file(request.path);

        const expiresAt = new Date(Date.now() + config.signedUrlExpiration * 1000);

        const [uploadUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: expiresAt,
          contentType: request.contentType,
        });

        const response: UploadUrlResponse = {
          uploadUrl,
          path: request.path,
          expiresAt: expiresAt.toISOString(),
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error handling upload-url request:', error);
        const response: ErrorResponse = {
          error: 'Failed to generate upload URL',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });

  subscriptions.push(uploadSub);

  // kernel.files.download-url - Generate signed GET URL
  const downloadSub = nc.subscribe('kernel.files.download-url', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: DownloadUrlRequest = JSON.parse(sc.decode(msg.data));

        // Validate path
        const validation = validatePath(request.path);
        if (!validation.valid) {
          const response: ErrorResponse = {
            error: validation.error!,
            code: 'INVALID_PATH',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        // Generate signed URL
        const bucket = storage.bucket(config.gcsBucket);
        const file = bucket.file(request.path);

        // Check if file exists
        const [exists] = await file.exists();
        if (!exists) {
          const response: ErrorResponse = {
            error: 'File not found',
            code: 'NOT_FOUND',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        const expiresAt = new Date(Date.now() + config.signedUrlExpiration * 1000);

        const [downloadUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: expiresAt,
        });

        const response: DownloadUrlResponse = {
          downloadUrl,
          path: request.path,
          expiresAt: expiresAt.toISOString(),
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error handling download-url request:', error);
        const response: ErrorResponse = {
          error: 'Failed to generate download URL',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });

  subscriptions.push(downloadSub);

  return subscriptions;
}
`;
}

function generateStreamsSetup(): string {
  return `/**
 * JetStream Setup
 * Creates KERNEL_EVENTS stream for durable event logging
 */

import type { NatsConnection } from 'nats';
import { RetentionPolicy, StorageType, DiscardPolicy } from 'nats';

const KERNEL_EVENTS_STREAM = 'KERNEL_EVENTS';

/**
 * Setup JetStream streams
 */
export async function setupStreams(nc: NatsConnection): Promise<void> {
  const jsm = await nc.jetstreamManager();

  // Check if stream already exists
  try {
    await jsm.streams.info(KERNEL_EVENTS_STREAM);
    console.log(\`Stream \${KERNEL_EVENTS_STREAM} already exists\`);
    return;
  } catch {
    // Stream doesn't exist, create it
  }

  // Create KERNEL_EVENTS stream
  await jsm.streams.add({
    name: KERNEL_EVENTS_STREAM,
    subjects: ['kernel.events.>'],
    retention: RetentionPolicy.Limits,
    max_age: 7 * 24 * 60 * 60 * 1000 * 1000000, // 7 days in nanoseconds
    max_bytes: 1024 * 1024 * 1024, // 1GB
    storage: StorageType.File,
    num_replicas: 1,
    discard: DiscardPolicy.Old,
  });

  console.log(\`Created stream \${KERNEL_EVENTS_STREAM}\`);
}
`;
}

function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build output
dist/

# Logs
*.log

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db
`;
}