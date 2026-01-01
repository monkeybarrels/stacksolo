/**
 * Auth Routes
 * POST /auth/validate - Validate Firebase ID token
 */

import { Router } from 'express';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
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