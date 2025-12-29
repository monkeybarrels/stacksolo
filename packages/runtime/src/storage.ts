/**
 * Google Cloud Storage helpers
 *
 * Note: These helpers require @google-cloud/storage to be installed in your project.
 * It's listed as an optional peer dependency.
 */

// Dynamic import to handle optional dependency
let Storage: typeof import('@google-cloud/storage').Storage | undefined;

async function loadStorage(): Promise<typeof import('@google-cloud/storage').Storage> {
  if (!Storage) {
    try {
      const module = await import('@google-cloud/storage');
      Storage = module.Storage;
    } catch {
      throw new Error(
        '@google-cloud/storage is required for storage helpers. ' +
          'Install it with: npm install @google-cloud/storage'
      );
    }
  }
  return Storage;
}

/**
 * Get a configured Google Cloud Storage client.
 *
 * @param projectId - Optional GCP project ID (uses default credentials if not provided)
 * @returns Storage client instance
 *
 * @example
 * ```typescript
 * import { getStorageClient } from '@stacksolo/runtime';
 *
 * const storage = await getStorageClient();
 * const [files] = await storage.bucket('my-bucket').getFiles();
 * ```
 */
export async function getStorageClient(projectId?: string): Promise<InstanceType<typeof import('@google-cloud/storage').Storage>> {
  const StorageClass = await loadStorage();
  return new StorageClass(projectId ? { projectId } : undefined);
}

/**
 * Upload a file to Google Cloud Storage.
 *
 * @param bucket - Bucket name
 * @param path - Path within the bucket
 * @param data - File contents (Buffer or string)
 * @param options - Optional upload options
 * @returns The public URL of the uploaded file (if public) or the gs:// URI
 *
 * @example
 * ```typescript
 * import { uploadFile } from '@stacksolo/runtime';
 *
 * const url = await uploadFile(
 *   process.env.STORAGE_BUCKET!,
 *   'uploads/image.png',
 *   imageBuffer,
 *   { contentType: 'image/png' }
 * );
 * ```
 */
export async function uploadFile(
  bucket: string,
  path: string,
  data: Buffer | string,
  options?: {
    contentType?: string;
    makePublic?: boolean;
    metadata?: Record<string, string>;
  }
): Promise<string> {
  const storage = await getStorageClient();
  const file = storage.bucket(bucket).file(path);

  await file.save(data, {
    contentType: options?.contentType,
    metadata: options?.metadata ? { metadata: options.metadata } : undefined,
  });

  if (options?.makePublic) {
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket}/${path}`;
  }

  return `gs://${bucket}/${path}`;
}

/**
 * Download a file from Google Cloud Storage.
 *
 * @param bucket - Bucket name
 * @param path - Path within the bucket
 * @returns File contents as Buffer
 *
 * @example
 * ```typescript
 * import { downloadFile } from '@stacksolo/runtime';
 *
 * const data = await downloadFile(process.env.STORAGE_BUCKET!, 'uploads/image.png');
 * ```
 */
export async function downloadFile(bucket: string, path: string): Promise<Buffer> {
  const storage = await getStorageClient();
  const [contents] = await storage.bucket(bucket).file(path).download();
  return contents;
}
