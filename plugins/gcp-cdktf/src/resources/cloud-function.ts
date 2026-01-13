import { defineResource, type ResourceConfig } from '@stacksolo/core';
import { generateLabelsCode, RESOURCE_TYPES } from '../utils/labels';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudFunction = defineResource({
  id: 'gcp-cdktf:cloud_function',
  provider: 'gcp-cdktf',
  name: 'Cloud Function',
  description: 'Serverless function (Gen2) that scales automatically',
  icon: 'functions',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Function Name',
        description: 'Unique name for the function',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region to deploy the function',
        default: 'us-central1',
      },
      runtime: {
        type: 'string',
        title: 'Runtime',
        description: 'Function runtime environment',
        default: 'nodejs20',
        enum: ['nodejs20', 'nodejs18', 'python311', 'python310', 'go121', 'go120'],
      },
      entryPoint: {
        type: 'string',
        title: 'Entry Point',
        description: 'Function entry point name',
        default: 'api',
      },
      memory: {
        type: 'string',
        title: 'Memory',
        description: 'Memory allocated to the function',
        default: '256Mi',
        enum: ['128Mi', '256Mi', '512Mi', '1Gi', '2Gi', '4Gi'],
      },
      timeout: {
        type: 'number',
        title: 'Timeout',
        description: 'Function timeout in seconds',
        default: 60,
      },
      minInstances: {
        type: 'number',
        title: 'Min Instances',
        description: 'Minimum number of instances',
        default: 0,
      },
      maxInstances: {
        type: 'number',
        title: 'Max Instances',
        description: 'Maximum number of instances',
        default: 100,
      },
      vpcConnector: {
        type: 'string',
        title: 'VPC Connector',
        description: 'VPC connector name for network access',
      },
      allowUnauthenticated: {
        type: 'boolean',
        title: 'Allow Unauthenticated',
        description: 'Allow public access without authentication',
        default: true,
      },
      projectName: {
        type: 'string',
        title: 'Project Name',
        description: 'StackSolo project name (injected as STACKSOLO_PROJECT_NAME)',
      },
      gatewayUrl: {
        type: 'string',
        title: 'Gateway URL',
        description: 'URL for service-to-service calls (e.g., load balancer URL)',
      },
      environmentVariables: {
        type: 'object',
        title: 'Environment Variables',
        description: 'Additional environment variables for the function',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['name', 'location'],
  },

  defaultConfig: {
    runtime: 'nodejs20',
    entryPoint: 'api',
    memory: '256Mi',
    timeout: 60,
    minInstances: 0,
    maxInstances: 100,
    allowUnauthenticated: true,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const fnConfig = config as {
      name: string;
      location: string;
      runtime?: string;
      entryPoint?: string;
      memory?: string;
      timeout?: number;
      minInstances?: number;
      maxInstances?: number;
      vpcConnector?: string;
      allowUnauthenticated?: boolean;
      projectId?: string;
      projectName?: string;
      gatewayUrl?: string;
      environmentVariables?: Record<string, string>;
    };

    const location = fnConfig.location;
    const runtime = fnConfig.runtime || 'nodejs20';
    const entryPoint = fnConfig.entryPoint || 'api';
    const memory = fnConfig.memory || '256Mi';
    const timeout = fnConfig.timeout || 60;
    const minInstances = fnConfig.minInstances ?? 0;
    const maxInstances = fnConfig.maxInstances ?? 100;
    const allowUnauthenticated = fnConfig.allowUnauthenticated ?? true;
    const projectId = fnConfig.projectId || '${var.project_id}';
    const projectName = fnConfig.projectName || '${var.project_name}';
    const gatewayUrl = fnConfig.gatewayUrl || '';
    // Build environment variables - user values override defaults
    const envVars: Record<string, string> = {
      NODE_ENV: 'production',
      GCP_PROJECT_ID: projectId,
      ...(projectName ? { STACKSOLO_PROJECT_NAME: projectName } : {}),
      ...(gatewayUrl ? { GATEWAY_URL: gatewayUrl } : {}),
      ...(fnConfig.environmentVariables || {}),
    };
    const labelsCode = generateLabelsCode(projectName, RESOURCE_TYPES.CLOUD_FUNCTION);

    // Source bucket and zip (each function has its own source zip)
    // Use relative path - the zip will be copied to the terraform stack directory
    const sourceZipFileName = `${config.name}-source.zip`;

    let code = `// Source bucket for function code
const ${varName}SourceBucket = new StorageBucket(this, '${config.name}-source', {
  name: '${projectId}-${config.name}-source',
  location: '${location}',
  uniformBucketLevelAccess: true,
  forceDestroy: true,
});

// Source zip object
const ${varName}SourceZip = new StorageBucketObject(this, '${config.name}-source-zip', {
  name: 'source.zip',
  bucket: ${varName}SourceBucket.name,
  source: '${sourceZipFileName}',
});

// Cloud Function Gen2
const ${varName}Function = new Cloudfunctions2Function(this, '${config.name}', {
  name: '${config.name}',
  location: '${location}',
  buildConfig: {
    runtime: '${runtime}',
    entryPoint: '${entryPoint}',
    source: {
      storageSource: {
        bucket: ${varName}SourceBucket.name,
        object: ${varName}SourceZip.name,
      },
    },
  },
  serviceConfig: {
    availableMemory: '${memory}',
    timeoutSeconds: ${timeout},
    maxInstanceCount: ${maxInstances},
    minInstanceCount: ${minInstances},
    ingressSettings: 'ALLOW_ALL',
    allTrafficOnLatestRevision: true,
    environmentVariables: {${Object.entries(envVars).map(([k, v]) => `\n      ${k}: '${v}',`).join('')}
    },`;

    // Add VPC connector if specified
    if (fnConfig.vpcConnector) {
      const connectorVar = toVariableName(fnConfig.vpcConnector);
      code += `
    vpcConnector: ${connectorVar}Connector.id,`;
    }

    code += `
  },
  ${labelsCode}
});`;

    // Add IAM binding for unauthenticated access (Gen2 functions need Cloud Run invoker)
    if (allowUnauthenticated) {
      code += `

// Allow public access (allUsers) - Cloud Functions IAM
new Cloudfunctions2FunctionIamMember(this, '${config.name}-invoker', {
  project: ${varName}Function.project,
  location: ${varName}Function.location,
  cloudFunction: ${varName}Function.name,
  role: 'roles/cloudfunctions.invoker',
  member: 'allUsers',
});

// Allow public access (allUsers) - Cloud Run IAM (Gen2 functions run on Cloud Run)
new CloudRunServiceIamMember(this, '${config.name}-run-invoker', {
  project: ${varName}Function.project,
  location: ${varName}Function.location,
  service: ${varName}Function.name,
  role: 'roles/run.invoker',
  member: 'allUsers',
});`;
    }

    return {
      imports: [
        "import { Cloudfunctions2Function } from '@cdktf/provider-google/lib/cloudfunctions2-function';",
        "import { Cloudfunctions2FunctionIamMember } from '@cdktf/provider-google/lib/cloudfunctions2-function-iam-member';",
        "import { CloudRunServiceIamMember } from '@cdktf/provider-google/lib/cloud-run-service-iam-member';",
        "import { StorageBucket } from '@cdktf/provider-google/lib/storage-bucket';",
        "import { StorageBucketObject } from '@cdktf/provider-google/lib/storage-bucket-object';",
      ],
      code,
      outputs: [
        `export const ${varName}FunctionUrl = ${varName}Function.url;`,
        `export const ${varName}FunctionName = ${varName}Function.name;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const fnConfig = config as { memory?: string };
    const memory = fnConfig.memory || '256Mi';

    const memoryPricing: Record<string, number> = {
      '128Mi': 0,
      '256Mi': 0,
      '512Mi': 5,
      '1Gi': 10,
      '2Gi': 20,
      '4Gi': 40,
    };

    const estimated = memoryPricing[memory] || 0;

    return {
      monthly: estimated,
      currency: 'USD',
      breakdown: [
        { item: 'Cloud Functions (first 2M invocations free)', amount: 0 },
        { item: 'Compute time (estimated)', amount: estimated },
      ],
    };
  },
});
