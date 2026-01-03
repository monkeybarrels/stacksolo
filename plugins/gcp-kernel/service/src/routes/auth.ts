/**
 * Auth Routes
 *
 * POST /auth/validate - Validate Firebase ID token
 */

import { Router, Request, Response } from 'express';
import { validateToken } from '../services/firebase.js';

export const authRouter = Router();

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
