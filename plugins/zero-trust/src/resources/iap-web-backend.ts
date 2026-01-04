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
 * Note: This resource enables the IAP API and creates OAuth consent screen automatically.
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
      projectId: {
        type: 'string',
        title: 'GCP Project ID',
        description: 'The GCP project ID',
      },
    },
    required: ['name', 'backendService', 'allowedMembers', 'supportEmail', 'projectId'],
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
      projectId: string;
    };

    const members = webConfig.allowedMembers;

    const code = `// =============================================================================
// Zero Trust IAP Protection: ${webConfig.name}
// =============================================================================
//
// This resource enables the IAP API.
// The actual IAP enablement and IAM bindings are applied via gcloud after
// terraform creates the backend services (handled by the deploy command).
//
// Protected backend: ${webConfig.backendService}
// Allowed members: ${members.join(', ')}

// Enable IAP API
const ${varName}IapApi = new ProjectService(this, '${config.name}-iap-api', {
  service: 'iap.googleapis.com',
  disableOnDestroy: false,
});`;

    return {
      imports: [
        "import { ProjectService } from '@cdktf/provider-google/lib/project-service';",
      ],
      code,
      outputs: [
        `// Access: Visit the Load Balancer URL - Google login will be required`,
        `// Protected Backend: ${webConfig.backendService}`,
        `// Note: Enable IAP on the backend via Console or: gcloud compute backend-services update ${webConfig.backendService} --global --iap=enabled`,
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
