/**
 * Access Control Service
 *
 * Manages dynamic access control via Firestore.
 * Uses the kernel_access collection to store access rules.
 *
 * Collection structure:
 * kernel_access/{resource}/members/{email} => { granted, grantedBy, permissions }
 */

import admin from 'firebase-admin';

const DEFAULT_COLLECTION = 'kernel_access';

interface AccessGrant {
  granted: admin.firestore.Timestamp;
  grantedBy: string;
  permissions: string[];
}

interface AccessEntry {
  member: string;
  granted: Date;
  grantedBy: string;
  permissions: string[];
}

interface AuditEntry {
  action: 'grant' | 'revoke';
  resource: string;
  member: string;
  permissions?: string[];
  performedBy: string;
  timestamp: admin.firestore.Timestamp;
}

function getFirestore(): admin.firestore.Firestore {
  return admin.firestore();
}

function getCollection(): string {
  return process.env.ACCESS_COLLECTION || DEFAULT_COLLECTION;
}

/**
 * Grant access to a resource for a member
 */
export async function grantAccess(params: {
  resource: string;
  member: string;
  permissions: string[];
  grantedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const { resource, member, permissions, grantedBy } = params;
  const db = getFirestore();
  const collection = getCollection();

  try {
    const docRef = db
      .collection(collection)
      .doc(resource)
      .collection('members')
      .doc(member);

    const grant: AccessGrant = {
      granted: admin.firestore.Timestamp.now(),
      grantedBy,
      permissions,
    };

    await docRef.set(grant);

    // Audit log
    await db.collection(`${collection}_audit`).add({
      action: 'grant',
      resource,
      member,
      permissions,
      performedBy: grantedBy,
      timestamp: admin.firestore.Timestamp.now(),
    } as AuditEntry);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to grant access';
    return { success: false, error: message };
  }
}

/**
 * Revoke access from a member for a resource
 */
export async function revokeAccess(params: {
  resource: string;
  member: string;
  revokedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const { resource, member, revokedBy } = params;
  const db = getFirestore();
  const collection = getCollection();

  try {
    const docRef = db
      .collection(collection)
      .doc(resource)
      .collection('members')
      .doc(member);

    const doc = await docRef.get();
    if (!doc.exists) {
      return { success: false, error: 'Access grant not found' };
    }

    await docRef.delete();

    // Audit log
    await db.collection(`${collection}_audit`).add({
      action: 'revoke',
      resource,
      member,
      performedBy: revokedBy,
      timestamp: admin.firestore.Timestamp.now(),
    } as AuditEntry);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke access';
    return { success: false, error: message };
  }
}

/**
 * Check if a member has access to a resource
 */
export async function checkAccess(params: {
  resource: string;
  member: string;
  permission?: string;
}): Promise<{ allowed: boolean; reason?: string; permissions?: string[] }> {
  const { resource, member, permission } = params;
  const db = getFirestore();
  const collection = getCollection();

  try {
    const docRef = db
      .collection(collection)
      .doc(resource)
      .collection('members')
      .doc(member);

    const doc = await docRef.get();

    if (!doc.exists) {
      return { allowed: false, reason: 'no_grant' };
    }

    const data = doc.data() as AccessGrant;

    // If specific permission requested, check it
    if (permission && !data.permissions.includes(permission)) {
      return {
        allowed: false,
        reason: 'permission_denied',
        permissions: data.permissions,
      };
    }

    return {
      allowed: true,
      reason: 'explicit_grant',
      permissions: data.permissions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check access';
    return { allowed: false, reason: message };
  }
}

/**
 * List all members with access to a resource
 */
export async function listAccess(params: {
  resource: string;
}): Promise<{ members: AccessEntry[]; error?: string }> {
  const { resource } = params;
  const db = getFirestore();
  const collection = getCollection();

  try {
    const snapshot = await db
      .collection(collection)
      .doc(resource)
      .collection('members')
      .get();

    const members: AccessEntry[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as AccessGrant;
      members.push({
        member: doc.id,
        granted: data.granted.toDate(),
        grantedBy: data.grantedBy,
        permissions: data.permissions,
      });
    });

    return { members };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list access';
    return { members: [], error: message };
  }
}

/**
 * List all protected resources
 */
export async function listResources(): Promise<{ resources: string[]; error?: string }> {
  const db = getFirestore();
  const collection = getCollection();

  try {
    const snapshot = await db.collection(collection).get();

    const resources: string[] = [];
    snapshot.forEach((doc) => {
      resources.push(doc.id);
    });

    return { resources };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list resources';
    return { resources: [], error: message };
  }
}
