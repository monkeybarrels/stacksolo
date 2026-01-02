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

interface ListFilesRequest {
  prefix?: string;
  maxResults?: number;
  pageToken?: string;
}

interface FileInfo {
  path: string;
  size: number;
  contentType: string;
  created: string;
  updated: string;
}

interface ListFilesResponse {
  files: FileInfo[];
  nextPageToken?: string;
}

interface DeleteFileRequest {
  path: string;
}

interface DeleteFileResponse {
  deleted: true;
  path: string;
}

interface MoveFileRequest {
  sourcePath: string;
  destinationPath: string;
}

interface MoveFileResponse {
  moved: true;
  sourcePath: string;
  destinationPath: string;
}

interface FileMetadataRequest {
  path: string;
}

interface FileMetadataResponse {
  path: string;
  size: number;
  contentType: string;
  created: string;
  updated: string;
  metadata?: Record<string, string>;
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

  // kernel.files.list - List files with a prefix
  const listSub = nc.subscribe('kernel.files.list', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: ListFilesRequest = JSON.parse(sc.decode(msg.data));

        const bucket = storage.bucket(config.gcsBucket);

        const [files, nextQuery] = await bucket.getFiles({
          prefix: request.prefix || '',
          maxResults: request.maxResults || 100,
          pageToken: request.pageToken,
          autoPaginate: false,
        });

        const response: ListFilesResponse = {
          files: files.map((file) => ({
            path: file.name,
            size: parseInt(file.metadata.size as string, 10) || 0,
            contentType: (file.metadata.contentType as string) || 'application/octet-stream',
            created: file.metadata.timeCreated as string,
            updated: file.metadata.updated as string,
          })),
          nextPageToken: nextQuery?.pageToken,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error listing files:', error);
        const response: ErrorResponse = {
          error: 'Failed to list files',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });

  subscriptions.push(listSub);

  // kernel.files.delete - Delete a file
  const deleteSub = nc.subscribe('kernel.files.delete', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: DeleteFileRequest = JSON.parse(sc.decode(msg.data));

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

        await file.delete();

        const response: DeleteFileResponse = {
          deleted: true,
          path: request.path,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error deleting file:', error);
        const response: ErrorResponse = {
          error: 'Failed to delete file',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });

  subscriptions.push(deleteSub);

  // kernel.files.move - Move/rename a file
  const moveSub = nc.subscribe('kernel.files.move', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: MoveFileRequest = JSON.parse(sc.decode(msg.data));

        // Validate source path
        const sourceValidation = validatePath(request.sourcePath);
        if (!sourceValidation.valid) {
          const response: ErrorResponse = {
            error: `Source: ${sourceValidation.error}`,
            code: 'INVALID_PATH',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        // Validate destination path
        const destValidation = validatePath(request.destinationPath);
        if (!destValidation.valid) {
          const response: ErrorResponse = {
            error: `Destination: ${destValidation.error}`,
            code: 'INVALID_PATH',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        const bucket = storage.bucket(config.gcsBucket);
        const sourceFile = bucket.file(request.sourcePath);

        // Check if source file exists
        const [exists] = await sourceFile.exists();
        if (!exists) {
          const response: ErrorResponse = {
            error: 'Source file not found',
            code: 'NOT_FOUND',
          };
          msg.respond(sc.encode(JSON.stringify(response)));
          return;
        }

        // Copy to destination then delete source
        await sourceFile.copy(request.destinationPath);
        await sourceFile.delete();

        const response: MoveFileResponse = {
          moved: true,
          sourcePath: request.sourcePath,
          destinationPath: request.destinationPath,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error moving file:', error);
        const response: ErrorResponse = {
          error: 'Failed to move file',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });

  subscriptions.push(moveSub);

  // kernel.files.metadata - Get file metadata
  const metadataSub = nc.subscribe('kernel.files.metadata', {
    callback: async (err, msg) => {
      if (err) {
        console.error('NATS subscription error:', err);
        return;
      }

      try {
        const request: FileMetadataRequest = JSON.parse(sc.decode(msg.data));

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

        const [metadata] = await file.getMetadata();

        const response: FileMetadataResponse = {
          path: request.path,
          size: parseInt(metadata.size as string, 10) || 0,
          contentType: (metadata.contentType as string) || 'application/octet-stream',
          created: metadata.timeCreated as string,
          updated: metadata.updated as string,
          metadata: metadata.metadata as Record<string, string> | undefined,
        };

        msg.respond(sc.encode(JSON.stringify(response)));
      } catch (error) {
        console.error('Error getting file metadata:', error);
        const response: ErrorResponse = {
          error: 'Failed to get file metadata',
          code: 'INTERNAL_ERROR',
        };
        msg.respond(sc.encode(JSON.stringify(response)));
      }
    },
  });

  subscriptions.push(metadataSub);

  return subscriptions;
}