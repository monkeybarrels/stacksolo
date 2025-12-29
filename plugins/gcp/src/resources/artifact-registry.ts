import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const artifactRegistry = defineResource({
  id: 'gcp:artifact_registry',
  provider: 'gcp',
  name: 'Artifact Registry',
  description: 'Secure, private container and artifact storage',
  icon: 'inventory',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Repository Name',
        description: 'Unique name for the repository',
        minLength: 2,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Location',
        description: 'GCP region for the repository',
        default: 'us-central1',
        enum: [
          'us-central1',
          'us-east1',
          'us-west1',
          'europe-west1',
          'europe-west2',
          'asia-east1',
          'asia-northeast1',
        ],
      },
      format: {
        type: 'string',
        title: 'Repository Format',
        description: 'Type of artifacts to store',
        default: 'DOCKER',
        enum: ['DOCKER', 'NPM', 'PYTHON', 'MAVEN', 'APT'],
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Optional description for the repository',
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    location: 'us-central1',
    format: 'DOCKER',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const registryConfig = config as {
      name: string;
      location?: string;
      format?: string;
      description?: string;
    };

    const location = registryConfig.location || 'us-central1';
    const format = registryConfig.format || 'DOCKER';

    let code = `const ${varName}Registry = new gcp.artifactregistry.Repository("${config.name}", {
  location: "${location}",
  repositoryId: "${config.name}",
  format: "${format}",`;

    if (registryConfig.description) {
      code += `\n  description: "${registryConfig.description}",`;
    }

    code += '\n});';

    // Generate repository URL based on format
    const urlOutput =
      format === 'DOCKER'
        ? `export const ${varName}RegistryUrl = pulumi.interpolate\`${location}-docker.pkg.dev/\${gcp.config.project}/${config.name}\`;`
        : `export const ${varName}RegistryUrl = ${varName}Registry.name;`;

    return {
      imports: [
        "import * as gcp from '@pulumi/gcp';",
        "import * as pulumi from '@pulumi/pulumi';",
      ],
      code,
      outputs: [urlOutput],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Storage (first 0.5 GB free)', amount: 0 },
      { item: 'Egress (varies by usage)', amount: 0 },
    ],
  }),
});
