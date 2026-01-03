/**
 * Zero Trust Auth - Runtime Extension
 *
 * Registers kernel.access methods for dynamic authorization.
 *
 * Import this module to enable access control methods on the kernel:
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 * import '@stacksolo/plugin-zero-trust-auth/runtime';
 *
 * // Now kernel.access is available
 * const { hasAccess } = await kernel.access.check('admin-dashboard', userEmail);
 * ```
 */

import { extendKernel } from '@stacksolo/runtime';

// =============================================================================
// Types
// =============================================================================

export interface AccessCheckResult {
  hasAccess: boolean;
  permissions: string[];
}

export interface AccessGrantResult {
  granted: boolean;
  resource: string;
  member: string;
  permissions: string[];
}

export interface AccessRevokeResult {
  revoked: boolean;
  resource: string;
  member: string;
}

export interface AccessMember {
  member: string;
  permissions: string[];
  grantedAt: string;
  grantedBy: string;
}

export interface AccessListResult {
  resource: string;
  members: AccessMember[];
}

export interface AccessResourcesResult {
  resources: string[];
}

// =============================================================================
// HTTP Client
// =============================================================================

/**
 * Get the kernel URL from environment
 */
function getKernelUrl(): string {
  const url = process.env.KERNEL_URL || process.env.GCP_KERNEL_URL;
  if (!url) {
    throw new Error(
      'KERNEL_URL or GCP_KERNEL_URL environment variable is required for access control'
    );
  }
  return url;
}

/**
 * Make a request to the kernel access API
 */
async function accessRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${getKernelUrl()}/access${path}`;

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Access API error: ${response.status}`);
  }

  return response.json();
}

// =============================================================================
// Access Control Methods
// =============================================================================

/**
 * Check if a member has access to a resource
 *
 * @param resource - Resource identifier (e.g., 'admin-dashboard')
 * @param member - Member email address
 * @param permission - Optional specific permission to check
 *
 * @example
 * ```ts
 * const { hasAccess, permissions } = await kernel.access.check(
 *   'admin-dashboard',
 *   'bob@example.com',
 *   'write'
 * );
 *
 * if (hasAccess) {
 *   console.log('Bob has permissions:', permissions);
 * }
 * ```
 */
async function check(
  resource: string,
  member: string,
  permission?: string
): Promise<AccessCheckResult> {
  return accessRequest<AccessCheckResult>('POST', '/check', {
    resource,
    member,
    permission,
  });
}

/**
 * Grant access to a member for a resource
 *
 * @param resource - Resource identifier
 * @param member - Member email to grant access to
 * @param permissions - Array of permissions to grant
 * @param grantedBy - Email of user granting access
 *
 * @example
 * ```ts
 * await kernel.access.grant(
 *   'admin-dashboard',
 *   'bob@example.com',
 *   ['read', 'write'],
 *   currentUser.email
 * );
 * ```
 */
async function grant(
  resource: string,
  member: string,
  permissions: string[],
  grantedBy: string
): Promise<AccessGrantResult> {
  return accessRequest<AccessGrantResult>('POST', '/grant', {
    resource,
    member,
    permissions,
    grantedBy,
  });
}

/**
 * Revoke access from a member for a resource
 *
 * @param resource - Resource identifier
 * @param member - Member email to revoke access from
 * @param revokedBy - Email of user revoking access
 *
 * @example
 * ```ts
 * await kernel.access.revoke(
 *   'admin-dashboard',
 *   'bob@example.com',
 *   currentUser.email
 * );
 * ```
 */
async function revoke(
  resource: string,
  member: string,
  revokedBy: string
): Promise<AccessRevokeResult> {
  return accessRequest<AccessRevokeResult>('POST', '/revoke', {
    resource,
    member,
    revokedBy,
  });
}

/**
 * List all members with access to a resource
 *
 * @param resource - Resource identifier
 *
 * @example
 * ```ts
 * const { members } = await kernel.access.list('admin-dashboard');
 * for (const m of members) {
 *   console.log(`${m.member}: ${m.permissions.join(', ')}`);
 * }
 * ```
 */
async function list(resource: string): Promise<AccessListResult> {
  return accessRequest<AccessListResult>('GET', `/list?resource=${encodeURIComponent(resource)}`);
}

/**
 * List all protected resources
 *
 * @example
 * ```ts
 * const { resources } = await kernel.access.resources();
 * console.log('Protected resources:', resources);
 * ```
 */
async function resources(): Promise<AccessResourcesResult> {
  return accessRequest<AccessResourcesResult>('GET', '/resources');
}

/**
 * Express middleware to require access to a resource
 *
 * Checks the IAP user header and verifies access via kernel.
 *
 * @param resource - Resource identifier to check
 * @param permission - Optional specific permission required
 *
 * @example
 * ```ts
 * import { kernel } from '@stacksolo/runtime';
 * import '@stacksolo/plugin-zero-trust-auth/runtime';
 *
 * app.get('/admin', kernel.access.requireAccess('admin-dashboard', 'read'), (req, res) => {
 *   res.json({ user: req.user, permissions: req.userPermissions });
 * });
 * ```
 */
function requireAccess(resource: string, permission?: string) {
  return async (req: any, res: any, next: any) => {
    // Get user email from IAP header
    const iapEmail = req.headers['x-goog-authenticated-user-email'];
    const userEmail = iapEmail
      ? iapEmail.toString().replace('accounts.google.com:', '')
      : null;

    if (!userEmail) {
      return res.status(401).json({
        error: 'Not authenticated',
        code: 'NO_IAP_USER',
      });
    }

    try {
      const result = await check(resource, userEmail, permission);

      if (!result.hasAccess) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED',
          resource,
          permission,
        });
      }

      // Attach user info to request
      req.user = { email: userEmail };
      req.userPermissions = result.permissions;

      next();
    } catch (error) {
      console.error('Access check failed:', error);
      return res.status(500).json({
        error: 'Access check failed',
        code: 'ACCESS_CHECK_ERROR',
      });
    }
  };
}

// =============================================================================
// Access Extension Object
// =============================================================================

/**
 * Access control methods for the kernel
 */
export const access = {
  check,
  grant,
  revoke,
  list,
  resources,
  requireAccess,
};

// =============================================================================
// Register Extension
// =============================================================================

// Register the access extension on the kernel
extendKernel('access', access);
