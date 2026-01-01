/**
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