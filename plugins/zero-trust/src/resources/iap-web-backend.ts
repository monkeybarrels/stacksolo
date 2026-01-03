import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * IAP Web Backend Resource
 *
 * Protects web applications with Google Cloud Identity-Aware Proxy (IAP).
 * Users must authenticate with their Google identity to access the application.
 *
 * Access method (after deployment):
 * - Just visit the URL in a browser
 * - Google login prompt appears automatically
 * - Only allowed members can access
 *
 * Note: Requires OAuth consent screen to be configured in the GCP project.
 */
export const iapWebBackend = defineResource({
  id: 'zero-trust:iap_web_backend',
  provider: 'zero-trust',
  name: 'IAP Web Backend',
  description:
    'Protect web applications with identity-based access control using IAP',
  icon: 'admin_panel_settings',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Configuration Name',
        description: 'Unique name for this IAP web backend configuration',
        minLength: 1,
        maxLength: 63,
      },
      backendService: {
        type: 'string',
        title: 'Backend Service',
        description:
          'Name of the backend service to protect (from Load Balancer)',
      },
      allowedMembers: {
        type: 'array',
        title: 'Allowed Members',
        description:
          'IAM members allowed to access (e.g., user:alice@example.com, group:devs@example.com, domain:example.com)',
        items: {
          type: 'string',
        },
      },
      supportEmail: {
        type: 'string',
        title: 'Support Email',
        description:
          'Support email displayed on the OAuth consent screen (required for external users)',
      },
      applicationTitle: {
        type: 'string',
        title: 'Application Title',
        description: 'Title shown on the OAuth consent screen',
      },
    },
    required: ['name', 'backendService', 'allowedMembers', 'supportEmail'],
  },

  defaultConfig: {},

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const webConfig = config as {
      name: string;
      backendService: string;
      allowedMembers: string[];
      supportEmail: string;
      applicationTitle?: string;
    };

    const members = webConfig.allowedMembers;
    const appTitle = webConfig.applicationTitle || webConfig.name;

    // Format members for Terraform
    const membersCode = members.map((m) => `    '${m}',`).join('\n');

    const code = `// IAP OAuth Brand (Consent Screen)
// Note: Only one brand can exist per project. If you already have one, remove this block.
const ${varName}IapBrand = new IapBrand(this, '${config.name}-brand', {
  supportEmail: '${webConfig.supportEmail}',
  applicationTitle: '${appTitle}',
});

// IAP OAuth Client
const ${varName}IapClient = new IapClient(this, '${config.name}-client', {
  displayName: '${appTitle} IAP Client',
  brand: ${varName}IapBrand.name,
});

// IAP Web Backend Service IAM Binding - Who can access via browser
const ${varName}IapWebBinding = new IapWebBackendServiceIamBinding(this, '${config.name}-web-binding', {
  project: \${var.project_id},
  webBackendService: '${webConfig.backendService}',
  role: 'roles/iap.httpsResourceAccessor',
  members: [
${membersCode}
  ],
});

// Enable IAP on the backend service
// Note: This requires the backend service to be connected to a Load Balancer
const ${varName}IapSettings = new IapWebBackendServiceIamPolicy(this, '${config.name}-iap-settings', {
  project: \${var.project_id},
  webBackendService: '${webConfig.backendService}',
  policyData: ${varName}IapWebBinding.policyData,
});`;

    return {
      imports: [
        "import { IapBrand } from '@cdktf/provider-google/lib/iap-brand';",
        "import { IapClient } from '@cdktf/provider-google/lib/iap-client';",
        "import { IapWebBackendServiceIamBinding } from '@cdktf/provider-google/lib/iap-web-backend-service-iam-binding';",
        "import { IapWebBackendServiceIamPolicy } from '@cdktf/provider-google/lib/iap-web-backend-service-iam-policy';",
      ],
      code,
      outputs: [
        `// Access: Visit the Load Balancer URL - Google login will be required`,
        `export const ${varName}OauthClientId = ${varName}IapClient.clientId;`,
        `export const ${varName}ProtectedBackend = '${webConfig.backendService}';`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'IAP Web Backend (no charge)', amount: 0 },
      { item: 'Note: Standard LB charges apply', amount: 0 },
    ],
  }),
});
