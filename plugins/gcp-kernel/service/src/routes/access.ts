/**
 * Access Control Routes
 *
 * Endpoints for managing dynamic access control via Firestore.
 *
 * POST /access/grant   - Grant access to a resource
 * POST /access/revoke  - Revoke access from a resource
 * POST /access/check   - Check if member has access
 * GET  /access/list    - List members with access to a resource
 * GET  /access/resources - List all protected resources
 */

import { Router } from 'express';
import {
  grantAccess,
  revokeAccess,
  checkAccess,
  listAccess,
  listResources,
} from '../services/access.js';

export const accessRouter = Router();

/**
 * Grant access to a resource
 *
 * POST /access/grant
 * Body: { resource, member, permissions, grantedBy }
 */
accessRouter.post('/grant', async (req, res) => {
  const { resource, member, permissions, grantedBy } = req.body;

  if (!resource || !member || !permissions || !grantedBy) {
    return res.status(400).json({
      error: 'Missing required fields: resource, member, permissions, grantedBy',
    });
  }

  if (!Array.isArray(permissions)) {
    return res.status(400).json({
      error: 'permissions must be an array',
    });
  }

  const result = await grantAccess({ resource, member, permissions, grantedBy });

  if (result.success) {
    return res.json({ granted: true, resource, member, permissions });
  }

  return res.status(500).json({ error: result.error });
});

/**
 * Revoke access from a resource
 *
 * POST /access/revoke
 * Body: { resource, member, revokedBy }
 */
accessRouter.post('/revoke', async (req, res) => {
  const { resource, member, revokedBy } = req.body;

  if (!resource || !member || !revokedBy) {
    return res.status(400).json({
      error: 'Missing required fields: resource, member, revokedBy',
    });
  }

  const result = await revokeAccess({ resource, member, revokedBy });

  if (result.success) {
    return res.json({ revoked: true, resource, member });
  }

  if (result.error === 'Access grant not found') {
    return res.status(404).json({ error: result.error });
  }

  return res.status(500).json({ error: result.error });
});

/**
 * Check if member has access to a resource
 *
 * POST /access/check
 * Body: { resource, member, permission? }
 */
accessRouter.post('/check', async (req, res) => {
  const { resource, member, permission } = req.body;

  if (!resource || !member) {
    return res.status(400).json({
      error: 'Missing required fields: resource, member',
    });
  }

  const result = await checkAccess({ resource, member, permission });

  // Transform response to match runtime expectation (hasAccess instead of allowed)
  return res.json({
    hasAccess: result.allowed,
    permissions: result.permissions || [],
    reason: result.reason,
  });
});

/**
 * List members with access to a resource
 *
 * GET /access/list?resource=xxx
 */
accessRouter.get('/list', async (req, res) => {
  const { resource } = req.query;

  if (!resource || typeof resource !== 'string') {
    return res.status(400).json({
      error: 'Missing required query param: resource',
    });
  }

  const result = await listAccess({ resource });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  return res.json({ resource, members: result.members });
});

/**
 * List all protected resources
 *
 * GET /access/resources
 */
accessRouter.get('/resources', async (_req, res) => {
  const result = await listResources();

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  return res.json({ resources: result.resources });
});
