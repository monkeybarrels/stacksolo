/**
 * Cloud Storage Service
 *
 * Handles file operations via signed URLs.
 */

import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const SIGNED_URL_EXPIRATION = parseInt(process.env.SIGNED_URL_EXPIRATION || '3600', 10);

function getBucket() {
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) {
    throw new Error('GCS_BUCKET environment variable not set');
  }
  return storage.bucket(bucketName);
}

/**
 * Validate file path - prevent path traversal attacks
 */
export function validatePath(path: string): { valid: boolean; error?: string } {
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
 * Generate a signed upload URL
 */
export async function getUploadUrl(
  path: string,
  contentType: string
): Promise<{ uploadUrl: string; path: string; expiresAt: string }> {
  const bucket = getBucket();
  const file = bucket.file(path);

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRATION * 1000);

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: expiresAt,
    contentType,
  });

  return {
    uploadUrl,
    path,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Generate a signed download URL
 */
export async function getDownloadUrl(
  path: string
): Promise<{ downloadUrl: string; path: string; expiresAt: string }> {
  const bucket = getBucket();
  const file = bucket.file(path);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('NOT_FOUND');
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRATION * 1000);

  const [downloadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt,
  });

  return {
    downloadUrl,
    path,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * List files with a prefix
 */
export async function listFiles(
  prefix?: string,
  maxResults?: number,
  pageToken?: string
): Promise<{
  files: Array<{
    path: string;
    size: number;
    contentType: string;
    created: string;
    updated: string;
  }>;
  nextPageToken?: string;
}> {
  const bucket = getBucket();

  const [files, nextQuery] = await bucket.getFiles({
    prefix: prefix || '',
    maxResults: maxResults || 100,
    pageToken,
    autoPaginate: false,
  });

  return {
    files: files.map((file) => ({
      path: file.name,
      size: parseInt(file.metadata.size as string, 10) || 0,
      contentType: (file.metadata.contentType as string) || 'application/octet-stream',
      created: file.metadata.timeCreated as string,
      updated: file.metadata.updated as string,
    })),
    nextPageToken: nextQuery?.pageToken,
  };
}

/**
 * Delete a file
 */
export async function deleteFile(path: string): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(path);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('NOT_FOUND');
  }

  await file.delete();
}

/**
 * Move/rename a file
 */
export async function moveFile(
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const bucket = getBucket();
  const sourceFile = bucket.file(sourcePath);

  // Check if source file exists
  const [exists] = await sourceFile.exists();
  if (!exists) {
    throw new Error('NOT_FOUND');
  }

  // Copy to destination then delete source
  await sourceFile.copy(destinationPath);
  await sourceFile.delete();
}

/**
 * Get file metadata
 */
export async function getFileMetadata(path: string): Promise<{
  path: string;
  size: number;
  contentType: string;
  created: string;
  updated: string;
  metadata?: Record<string, string>;
}> {
  const bucket = getBucket();
  const file = bucket.file(path);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error('NOT_FOUND');
  }

  const [metadata] = await file.getMetadata();

  return {
    path,
    size: parseInt(metadata.size as string, 10) || 0,
    contentType: (metadata.contentType as string) || 'application/octet-stream',
    created: metadata.timeCreated as string,
    updated: metadata.updated as string,
    metadata: metadata.metadata as Record<string, string> | undefined,
  };
}
