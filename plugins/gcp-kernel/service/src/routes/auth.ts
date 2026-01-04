/**
 * Auth Routes
 *
 * GET  /auth/whoami   - Get current user from IAP headers
 * POST /auth/validate - Validate Firebase ID token
 */

import { Router, Request, Response } from 'express';
import { validateToken } from '../services/firebase.js';

export const authRouter = Router();

/**
 * Get current user identity from IAP headers
 *
 * GET /auth/whoami
 *
 * Returns the authenticated user's email and ID from IAP headers.
 * This endpoint is useful for SPAs that need to know who is logged in.
 */
authRouter.get('/whoami', (req: Request, res: Response) => {
  // IAP sets these headers after authentication
  const iapEmail = req.headers['x-goog-authenticated-user-email'] as string | undefined;
  const iapId = req.headers['x-goog-authenticated-user-id'] as string | undefined;

  if (!iapEmail) {
    res.status(401).json({
      authenticated: false,
      error: 'No IAP authentication detected',
      hint: 'This endpoint requires requests to pass through Identity-Aware Proxy',
    });
    return;
  }

  // IAP email format: "accounts.google.com:user@example.com"
  const email = iapEmail.replace('accounts.google.com:', '');
  const id = iapId?.replace('accounts.google.com:', '');

  res.json({
    authenticated: true,
    email,
    id,
    // Include raw headers for debugging
    raw: {
      email: iapEmail,
      id: iapId,
    },
  });
});

interface ValidateRequest {
  token: string;
}

authRouter.post('/validate', async (req: Request, res: Response) => {
  try {
    const { token } = req.body as ValidateRequest;

    if (!token) {
      res.status(400).json({
        error: 'Token is required',
        code: 'MISSING_TOKEN',
      });
      return;
    }

    const result = await validateToken(token);

    if (result.valid) {
      res.json({
        valid: true,
        uid: result.uid,
        email: result.email,
        claims: result.claims,
      });
    } else {
      res.status(401).json({
        valid: false,
        error: result.error,
        code: 'INVALID_TOKEN',
      });
    }
  } catch (error) {
    console.error('Auth validation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});
