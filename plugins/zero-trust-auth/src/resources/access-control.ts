import { defineResource } from '@stacksolo/core';

/**
 * Access Control Resource
 *
 * This resource configures dynamic access control via Firestore.
 * It requires:
 * - kernel or gcpKernel config for Firestore access
 * - zero-trust config for IAP authentication
 *
 * The generated code sets up:
 * - Firestore security rules for the access collection
 * - IAM bindings for the kernel service account
 */
export const accessControl = defineResource({
  id: 'zero-trust-auth:access_control',
  provider: 'zero-trust-auth',
  name: 'Access Control',
  description: 'Dynamic authorization via Firestore for IAP-protected resources',
  icon: 'lock',
  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Configuration name',
      },
      resources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Backend names to enable dynamic access control for',
      },
      firestoreCollection: {
        type: 'string',
        default: 'kernel_access',
        description: 'Firestore collection for access rules',
      },
      adminRoles: {
        type: 'array',
        items: { type: 'string' },
        default: ['admin'],
        description: 'Roles that can manage access (grant/revoke)',
      },
    },
    required: ['name', 'resources'],
  },
  defaultConfig: {
    firestoreCollection: 'kernel_access',
    adminRoles: ['admin'],
  },
  generate: (config) => {
    const { name, resources, firestoreCollection, adminRoles } = config;

    // Generate Firestore security rules
    const firestoreRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Access control collection
    match /${firestoreCollection}/{resource}/members/{member} {
      // Only kernel service account can read/write
      allow read, write: if request.auth != null
        && request.auth.token.email.matches('.*@.*\\.iam\\.gserviceaccount\\.com$');
    }

    // Access audit log
    match /${firestoreCollection}_audit/{logId} {
      allow read: if request.auth != null
        && request.auth.token.email.matches('.*@.*\\.iam\\.gserviceaccount\\.com$');
      allow create: if request.auth != null
        && request.auth.token.email.matches('.*@.*\\.iam\\.gserviceaccount\\.com$');
      allow update, delete: if false;
    }
  }
}`;

    // Generate CDKTF code for IAM bindings
    const imports = [
      'import { ProjectIamMember } from "@cdktf/provider-google/lib/project-iam-member";',
    ];

    const resourceList = resources.map((r: string) => `"${r}"`).join(', ');
    const adminRolesList = adminRoles.map((r: string) => `"${r}"`).join(', ');

    const code = `
// Zero Trust Auth: Access Control for ${name}
// Protected resources: ${resourceList}
// Admin roles: ${adminRolesList}
// Firestore collection: ${firestoreCollection}

// Grant Firestore access to kernel service account
new ProjectIamMember(this, "${name}-firestore-access", {
  project: config.project.gcpProjectId,
  role: "roles/datastore.user",
  member: \`serviceAccount:\${kernelServiceAccount.email}\`,
});

// Note: Firestore security rules should be deployed separately
// Rules file: firestore.rules
/*
${firestoreRules}
*/
`;

    return {
      imports,
      code,
      outputs: [
        `${name}_firestore_collection = "${firestoreCollection}"`,
        `${name}_protected_resources = [${resourceList}]`,
      ],
    };
  },
});
