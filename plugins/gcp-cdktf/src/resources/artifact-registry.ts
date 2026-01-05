import { defineResource, type ResourceConfig } from '@stacksolo/core';
import { generateLabelsCode, RESOURCE_TYPES } from '../utils/labels';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const artifactRegistry = defineResource({
  id: 'gcp-cdktf:artifact_registry',
  provider: 'gcp-cdktf',
  name: 'Artifact Registry',
  description: 'Docker container registry for storing and managing container images',
  icon: 'artifact_registry',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Repository Name',
        description: 'Unique name for the repository',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region for the repository',
        default: 'us-central1',
      },
      format: {
        type: 'string',
        title: 'Format',
        description: 'Repository format',
        default: 'DOCKER',
        enum: ['DOCKER', 'NPM', 'PYTHON', 'MAVEN', 'APT', 'YUM'],
      },
      description: {
        type: 'string',
        title: 'Description',
        description: 'Description of the repository',
      },
      immutableTags: {
        type: 'boolean',
        title: 'Immutable Tags',
        description: 'Prevent tag overwrites',
        default: false,
      },
      existing: {
        type: 'boolean',
        title: 'Use Existing Registry',
        description: 'Reference an existing Artifact Registry instead of creating a new one.',
        default: false,
      },
    },
    required: ['name', 'location'],
  },

  defaultConfig: {
    format: 'DOCKER',
    immutableTags: false,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const registryConfig = config as {
      name: string;
      location: string;
      format?: string;
      description?: string;
      immutableTags?: boolean;
      existing?: boolean;
      projectId?: string;
      projectName?: string;
    };

    const location = registryConfig.location;
    const projectId = registryConfig.projectId || '${var.project_id}';

    // If using an existing registry, use a data source lookup
    if (registryConfig.existing) {
      const code = `// Artifact Registry repository (existing)
const ${varName}Registry = new DataGoogleArtifactRegistryRepository(this, '${config.name}', {
  repositoryId: '${config.name}',
  location: '${location}',
});`;

      return {
        imports: [
          "import { DataGoogleArtifactRegistryRepository } from '@cdktf/provider-google/lib/data-google-artifact-registry-repository';",
        ],
        code,
        outputs: [
          `export const ${varName}RegistryUrl = \`${location}-docker.pkg.dev/${projectId}/${config.name}\`;`,
          `export const ${varName}RegistryName = ${varName}Registry.repositoryId;`,
        ],
      };
    }

    // Create a new registry
    const format = registryConfig.format || 'DOCKER';
    const description = registryConfig.description || `Container registry for ${config.name}`;
    const immutableTags = registryConfig.immutableTags ?? false;
    const projectName = registryConfig.projectName || '${var.project_name}';
    const labelsCode = generateLabelsCode(projectName, RESOURCE_TYPES.ARTIFACT_REGISTRY);

    const code = `// Artifact Registry repository
const ${varName}Registry = new ArtifactRegistryRepository(this, '${config.name}', {
  repositoryId: '${config.name}',
  location: '${location}',
  format: '${format}',
  description: '${description}',${immutableTags ? `
  dockerConfig: {
    immutableTags: true,
  },` : ''}
  ${labelsCode}
});`;

    return {
      imports: [
        "import { ArtifactRegistryRepository } from '@cdktf/provider-google/lib/artifact-registry-repository';",
      ],
      code,
      outputs: [
        `export const ${varName}RegistryUrl = \`${location}-docker.pkg.dev/\${${varName}Registry.project}/${config.name}\`;`,
        `export const ${varName}RegistryName = ${varName}Registry.repositoryId;`,
      ],
    };
  },

  estimateCost: () => {
    // Artifact Registry pricing: $0.10 per GB/month for storage
    // Assuming 10GB average storage
    return {
      monthly: 1,
      currency: 'USD',
      breakdown: [
        { item: 'Storage (estimated 10GB)', amount: 1 },
        { item: 'Network egress (same region)', amount: 0 },
      ],
    };
  },
});
