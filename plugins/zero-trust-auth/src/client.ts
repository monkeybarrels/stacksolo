/**
 * Zero Trust Auth - Browser Client
 *
 * Lightweight client for SPAs to interact with the kernel's access control.
 * No Node.js dependencies - works in any browser environment.
 *
 * @example
 * ```ts
 * import { createAccessClient } from '@stacksolo/plugin-zero-trust-auth/client';
 *
 * const access = createAccessClient('https://kernel.your-project.run.app');
 *
 * // Get current user from IAP
 * const { email } = await access.whoami();
 *
 * // Check access
 * const { hasAccess, permissions } = await access.check('dashboard', email);
 *
 * if (hasAccess) {
 *   showDashboard();
 * }
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export interface WhoAmIResult {
  authenticated: true;
  email: string;
  id?: string;
}

export interface WhoAmIError {
  authenticated: false;
  error: string;
  hint?: string;
}

export type WhoAmIResponse = WhoAmIResult | WhoAmIError;

export interface AccessCheckResult {
  hasAccess: boolean;
  permissions: string[];
  reason?: string;
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

// =============================================================================
// Client Factory
// =============================================================================

export interface AccessClient {
  /**
   * Get the current authenticated user from IAP headers
   *
   * @example
   * ```ts
   * const result = await access.whoami();
   * if (result.authenticated) {
   *   console.log('Logged in as:', result.email);
   * }
   * ```
   */
  whoami(): Promise<WhoAmIResponse>;

  /**
   * Check if a member has access to a resource
   *
   * @param resource - Resource identifier (e.g., 'admin-dashboard')
   * @param member - Member email address
   * @param permission - Optional specific permission to check
   */
  check(resource: string, member: string, permission?: string): Promise<AccessCheckResult>;

  /**
   * Grant access to a member for a resource
   *
   * @param resource - Resource identifier
   * @param member - Member email to grant access to
   * @param permissions - Array of permissions to grant
   * @param grantedBy - Email of user granting access
   */
  grant(
    resource: string,
    member: string,
    permissions: string[],
    grantedBy: string
  ): Promise<AccessGrantResult>;

  /**
   * Revoke access from a member for a resource
   *
   * @param resource - Resource identifier
   * @param member - Member email to revoke access from
   * @param revokedBy - Email of user revoking access
   */
  revoke(resource: string, member: string, revokedBy: string): Promise<AccessRevokeResult>;

  /**
   * List all members with access to a resource
   *
   * @param resource - Resource identifier
   */
  list(resource: string): Promise<AccessListResult>;

  /**
   * Check access for the current IAP user
   *
   * Convenience method that combines whoami() + check()
   *
   * @param resource - Resource identifier
   * @param permission - Optional specific permission to check
   */
  checkMyAccess(resource: string, permission?: string): Promise<AccessCheckResult & { email: string }>;
}

/**
 * Create an access control client for browser SPAs
 *
 * @param kernelUrl - The kernel service URL (e.g., 'https://kernel.your-project.run.app')
 *
 * @example
 * ```ts
 * const access = createAccessClient('https://kernel.your-project.run.app');
 *
 * // Get current user
 * const user = await access.whoami();
 *
 * // Check their access
 * const { hasAccess } = await access.check('dashboard', user.email);
 * ```
 */
export function createAccessClient(kernelUrl: string): AccessClient {
  const baseUrl = kernelUrl.replace(/\/$/, ''); // Remove trailing slash

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include', // Include cookies for IAP
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({ error: 'Unknown error' }))) as {
        error?: string;
      };
      throw new Error(errorData.error || `Request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    async whoami(): Promise<WhoAmIResponse> {
      return request<WhoAmIResponse>('GET', '/auth/whoami');
    },

    async check(resource: string, member: string, permission?: string): Promise<AccessCheckResult> {
      return request<AccessCheckResult>('POST', '/access/check', {
        resource,
        member,
        permission,
      });
    },

    async grant(
      resource: string,
      member: string,
      permissions: string[],
      grantedBy: string
    ): Promise<AccessGrantResult> {
      return request<AccessGrantResult>('POST', '/access/grant', {
        resource,
        member,
        permissions,
        grantedBy,
      });
    },

    async revoke(resource: string, member: string, revokedBy: string): Promise<AccessRevokeResult> {
      return request<AccessRevokeResult>('POST', '/access/revoke', {
        resource,
        member,
        revokedBy,
      });
    },

    async list(resource: string): Promise<AccessListResult> {
      return request<AccessListResult>('GET', `/access/list?resource=${encodeURIComponent(resource)}`);
    },

    async checkMyAccess(
      resource: string,
      permission?: string
    ): Promise<AccessCheckResult & { email: string }> {
      const user = await this.whoami();

      if (!user.authenticated) {
        return {
          hasAccess: false,
          permissions: [],
          reason: 'not_authenticated',
          email: '',
        };
      }

      const result = await this.check(resource, user.email, permission);
      return { ...result, email: user.email };
    },
  };
}

// =============================================================================
// Singleton for convenience
// =============================================================================

let defaultClient: AccessClient | null = null;

/**
 * Initialize the default access client
 *
 * Call this once at app startup, then use the exported functions.
 *
 * @example
 * ```ts
 * // In your app's entry point
 * import { initAccess, whoami, checkMyAccess } from '@stacksolo/plugin-zero-trust-auth/client';
 *
 * initAccess('https://kernel.your-project.run.app');
 *
 * // Later, anywhere in your app
 * const user = await whoami();
 * const { hasAccess } = await checkMyAccess('dashboard');
 * ```
 */
export function initAccess(kernelUrl: string): AccessClient {
  defaultClient = createAccessClient(kernelUrl);
  return defaultClient;
}

function getClient(): AccessClient {
  if (!defaultClient) {
    throw new Error('Access client not initialized. Call initAccess(kernelUrl) first.');
  }
  return defaultClient;
}

// Convenience exports for initialized client
export const whoami = () => getClient().whoami();
export const check = (resource: string, member: string, permission?: string) =>
  getClient().check(resource, member, permission);
export const grant = (
  resource: string,
  member: string,
  permissions: string[],
  grantedBy: string
) => getClient().grant(resource, member, permissions, grantedBy);
export const revoke = (resource: string, member: string, revokedBy: string) =>
  getClient().revoke(resource, member, revokedBy);
export const list = (resource: string) => getClient().list(resource);
export const checkMyAccess = (resource: string, permission?: string) =>
  getClient().checkMyAccess(resource, permission);
