/**
 * Files Routes
 *
 * POST /files/upload-url    - Get signed upload URL
 * POST /files/download-url  - Get signed download URL
 * POST /files/list          - List files with prefix
 * POST /files/delete        - Delete file
 * POST /files/move          - Move/rename file
 * POST /files/metadata      - Get file metadata
 */

import { Router, Request, Response } from 'express';
import {
  validatePath,
  getUploadUrl,
  getDownloadUrl,
  listFiles,
  deleteFile,
  moveFile,
  getFileMetadata,
} from '../services/storage.js';

export const filesRouter = Router();

// POST /files/upload-url
filesRouter.post('/upload-url', async (req: Request, res: Response) => {
  try {
    const { path, contentType } = req.body as { path: string; contentType: string };

    // Validate path
    const validation = validatePath(path);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
        code: 'INVALID_PATH',
      });
      return;
    }

    // Validate content type
    if (!contentType) {
      res.status(400).json({
        error: 'Content type is required',
        code: 'MISSING_CONTENT_TYPE',
      });
      return;
    }

    const result = await getUploadUrl(path, contentType);
    res.json(result);
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({
      error: 'Failed to generate upload URL',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /files/download-url
filesRouter.post('/download-url', async (req: Request, res: Response) => {
  try {
    const { path } = req.body as { path: string };

    // Validate path
    const validation = validatePath(path);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
        code: 'INVALID_PATH',
      });
      return;
    }

    const result = await getDownloadUrl(path);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({
        error: 'File not found',
        code: 'NOT_FOUND',
      });
      return;
    }
    console.error('Error generating download URL:', error);
    res.status(500).json({
      error: 'Failed to generate download URL',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /files/list
filesRouter.post('/list', async (req: Request, res: Response) => {
  try {
    const { prefix, maxResults, pageToken } = req.body as {
      prefix?: string;
      maxResults?: number;
      pageToken?: string;
    };

    const result = await listFiles(prefix, maxResults, pageToken);
    res.json(result);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      error: 'Failed to list files',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /files/delete
filesRouter.post('/delete', async (req: Request, res: Response) => {
  try {
    const { path } = req.body as { path: string };

    // Validate path
    const validation = validatePath(path);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
        code: 'INVALID_PATH',
      });
      return;
    }

    await deleteFile(path);
    res.json({
      deleted: true,
      path,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({
        error: 'File not found',
        code: 'NOT_FOUND',
      });
      return;
    }
    console.error('Error deleting file:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /files/move
filesRouter.post('/move', async (req: Request, res: Response) => {
  try {
    const { sourcePath, destinationPath } = req.body as {
      sourcePath: string;
      destinationPath: string;
    };

    // Validate source path
    const sourceValidation = validatePath(sourcePath);
    if (!sourceValidation.valid) {
      res.status(400).json({
        error: `Source: ${sourceValidation.error}`,
        code: 'INVALID_PATH',
      });
      return;
    }

    // Validate destination path
    const destValidation = validatePath(destinationPath);
    if (!destValidation.valid) {
      res.status(400).json({
        error: `Destination: ${destValidation.error}`,
        code: 'INVALID_PATH',
      });
      return;
    }

    await moveFile(sourcePath, destinationPath);
    res.json({
      moved: true,
      sourcePath,
      destinationPath,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({
        error: 'Source file not found',
        code: 'NOT_FOUND',
      });
      return;
    }
    console.error('Error moving file:', error);
    res.status(500).json({
      error: 'Failed to move file',
      code: 'INTERNAL_ERROR',
    });
  }
});

// POST /files/metadata
filesRouter.post('/metadata', async (req: Request, res: Response) => {
  try {
    const { path } = req.body as { path: string };

    // Validate path
    const validation = validatePath(path);
    if (!validation.valid) {
      res.status(400).json({
        error: validation.error,
        code: 'INVALID_PATH',
      });
      return;
    }

    const result = await getFileMetadata(path);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      res.status(404).json({
        error: 'File not found',
        code: 'NOT_FOUND',
      });
      return;
    }
    console.error('Error getting file metadata:', error);
    res.status(500).json({
      error: 'Failed to get file metadata',
      code: 'INTERNAL_ERROR',
    });
  }
});
