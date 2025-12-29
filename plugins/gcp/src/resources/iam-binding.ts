import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const iamBinding = defineResource({
  id: 'gcp:iam_binding',
  provider: 'gcp',
  name: 'IAM Binding',
  description: 'Grant IAM roles to members at project, folder, or organization level',
  icon: 'admin_panel_settings',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Binding Name',
        description: 'Unique name for this binding resource',
        minLength: 1,
        maxLength: 63,
      },
      role: {
        type: 'string',
        title: 'Role',
        description: 'IAM role to grant (e.g., roles/storage.admin)',
      },
      members: {
        type: 'array',
        title: 'Members',
        description: 'Members to grant the role to',
      },
      resourceType: {
        type: 'string',
        title: 'Resource Type',
        description: 'Type of resource to bind to',
        default: 'project',
        enum: ['project', 'bucket', 'serviceAccount', 'cloudrun'],
      },
      resourceName: {
        type: 'string',
        title: 'Resource Name',
        description: 'Name of the resource (bucket name, service account email, etc.)',
      },
      condition: {
        type: 'object',
        title: 'Condition',
        description: 'IAM condition for the binding',
      },
    },
    required: ['name', 'role', 'members'],
  },

  defaultConfig: {
    resourceType: 'project',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const iamConfig = config as {
      name: string;
      role: string;
      members: string[];
      resourceType?: string;
      resourceName?: string;
      condition?: {
        title: string;
        description?: string;
        expression: string;
      };
    };

    const resourceType = iamConfig.resourceType || 'project';
    const membersArray = JSON.stringify(iamConfig.members);
    let code = '';

    if (resourceType === 'project') {
      code = `const ${varName}Binding = new gcp.projects.IAMMember("${config.name}", {
  role: "${iamConfig.role}",
  member: ${membersArray}[0],`;
    } else if (resourceType === 'bucket' && iamConfig.resourceName) {
      code = `const ${varName}Binding = new gcp.storage.BucketIAMMember("${config.name}", {
  bucket: "${iamConfig.resourceName}",
  role: "${iamConfig.role}",
  member: ${membersArray}[0],`;
    } else if (resourceType === 'serviceAccount' && iamConfig.resourceName) {
      code = `const ${varName}Binding = new gcp.serviceaccount.IAMMember("${config.name}", {
  serviceAccountId: "${iamConfig.resourceName}",
  role: "${iamConfig.role}",
  member: ${membersArray}[0],`;
    } else if (resourceType === 'cloudrun' && iamConfig.resourceName) {
      code = `const ${varName}Binding = new gcp.cloudrunv2.ServiceIamMember("${config.name}", {
  name: "${iamConfig.resourceName}",
  role: "${iamConfig.role}",
  member: ${membersArray}[0],`;
    }

    if (iamConfig.condition) {
      code += `\n  condition: {
    title: "${iamConfig.condition.title}",
    expression: "${iamConfig.condition.expression}",`;
      if (iamConfig.condition.description) {
        code += `\n    description: "${iamConfig.condition.description}",`;
      }
      code += '\n  },';
    }

    code += '\n});';

    // For multiple members, create multiple bindings
    if (iamConfig.members.length > 1) {
      code = `// Binding for multiple members
${iamConfig.members.map((member, i) => {
  let binding = '';
  if (resourceType === 'project') {
    binding = `const ${varName}Binding${i} = new gcp.projects.IAMMember("${config.name}-${i}", {
  role: "${iamConfig.role}",
  member: "${member}",
});`;
  } else if (resourceType === 'bucket') {
    binding = `const ${varName}Binding${i} = new gcp.storage.BucketIAMMember("${config.name}-${i}", {
  bucket: "${iamConfig.resourceName}",
  role: "${iamConfig.role}",
  member: "${member}",
});`;
  }
  return binding;
}).join('\n\n')}`;
    }

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}BindingId = ${varName}Binding${iamConfig.members.length > 1 ? '0' : ''}.id;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'IAM bindings (no charge)', amount: 0 },
    ],
  }),
});
