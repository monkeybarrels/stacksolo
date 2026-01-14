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
 * This resource automatically:
 * 1. Enables the IAP API
 * 2. Creates OAuth consent screen (brand)
 * 3. Creates OAuth client for IAP
 * 4. Grants access to specified members via IAM bindings
 *
 * Note: The backend service must have IAP enabled via the `iap` block.
 * The load balancer resource will reference this OAuth client when `iapEnabled: true`
 * is set on a route.
 *
 * Access method (after deployment):
 * - Just visit the URL in a browser
 * - Google login prompt appears automatically
 * - Only allowed members can access
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
    const appTitle = webConfig.applicationTitle || webConfig.name;
    const backendVar = toVariableName(webConfig.backendService);

    // Generate IAM member bindings for each allowed member
    const iamMemberCode = members.map((member, index) => {
      // Handle the member format - ensure it has a prefix
      const formattedMember = member.includes(':') ? member : `user:${member}`;
      return `// IAM binding for ${formattedMember}
new IapWebBackendServiceIamMember(this, '${config.name}-iam-${index}', {
  project: '${webConfig.projectId}',
  webBackendService: ${backendVar}Backend.name,
  role: 'roles/iap.httpsResourceAccessor',
  member: '${formattedMember}',
});`;
    }).join('\n\n');

    const code = `// =============================================================================
// Zero Trust IAP Protection: ${webConfig.name}
// =============================================================================
//
// This resource configures Identity-Aware Proxy (IAP) for the backend service.
// It automatically creates:
// - OAuth consent screen (brand)
// - OAuth client for IAP
// - IAM bindings for allowed members
//
// The backend service (${webConfig.backendService}) must have IAP enabled.
// This is typically done in the load balancer configuration with iapEnabled: true
//
// Protected backend: ${webConfig.backendService}
// Allowed members: ${members.join(', ')}

// Enable IAP API
const ${varName}IapApi = new ProjectService(this, '${config.name}-iap-api', {
  service: 'iap.googleapis.com',
  disableOnDestroy: false,
});

// OAuth Brand (consent screen)
// Note: Only one brand can exist per project. If you get an "already exists" error,
// the brand was created previously and this will import/reuse it.
const ${varName}Brand = new IapBrand(this, '${config.name}-brand', {
  supportEmail: '${webConfig.supportEmail}',
  applicationTitle: '${appTitle}',
  project: '${webConfig.projectId}',
});

// OAuth Client for IAP
// This client is used by the backend service's IAP configuration
const ${varName}Client = new IapClient(this, '${config.name}-client', {
  displayName: '${webConfig.name}-iap-client',
  brand: ${varName}Brand.name,
});

// Export OAuth client credentials for use by load balancer backend
// The load balancer will reference these when creating the backend service
export const ${varName}OAuthClientId = ${varName}Client.clientId;
export const ${varName}OAuthClientSecret = ${varName}Client.secret;

${iamMemberCode}`;

    return {
      imports: [
        "import { ProjectService } from '@cdktf/provider-google/lib/project-service';",
        "import { IapBrand } from '@cdktf/provider-google/lib/iap-brand';",
        "import { IapClient } from '@cdktf/provider-google/lib/iap-client';",
        "import { IapWebBackendServiceIamMember } from '@cdktf/provider-google/lib/iap-web-backend-service-iam-member';",
      ],
      code,
      outputs: [
        `export const ${varName}OAuthClientId = ${varName}Client.clientId;`,
        `export const ${varName}OAuthClientSecret = ${varName}Client.secret;`,
        `// IAP OAuth credentials configured for backend: ${webConfig.backendService}`,
        `// Access: Visit the Load Balancer URL - Google login will be required`,
        `// Allowed members: ${members.join(', ')}`,
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
