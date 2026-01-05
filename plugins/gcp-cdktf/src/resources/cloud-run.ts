import { defineResource, type ResourceConfig } from '@stacksolo/core';
import { generateLabelsCode, RESOURCE_TYPES } from '../utils/labels';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudRun = defineResource({
  id: 'gcp-cdktf:cloud_run',
  provider: 'gcp-cdktf',
  name: 'Cloud Run',
  description: 'Fully managed container platform that scales automatically',
  icon: 'cloud_run',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Service Name',
        description: 'Unique name for the Cloud Run service',
        minLength: 1,
        maxLength: 63,
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region to deploy the service',
        default: 'us-central1',
      },
      image: {
        type: 'string',
        title: 'Container Image',
        description: 'Container image to deploy (e.g., gcr.io/project/image:tag)',
      },
      port: {
        type: 'number',
        title: 'Port',
        description: 'Port the container listens on',
        default: 8080,
      },
      memory: {
        type: 'string',
        title: 'Memory',
        description: 'Memory allocated to each instance',
        default: '512Mi',
        enum: ['256Mi', '512Mi', '1Gi', '2Gi', '4Gi', '8Gi'],
      },
      cpu: {
        type: 'string',
        title: 'CPU',
        description: 'CPU allocated to each instance',
        default: '1',
        enum: ['1', '2', '4', '8'],
      },
      minInstances: {
        type: 'number',
        title: 'Min Instances',
        description: 'Minimum number of instances (0 for scale to zero)',
        default: 0,
      },
      maxInstances: {
        type: 'number',
        title: 'Max Instances',
        description: 'Maximum number of instances',
        default: 100,
      },
      concurrency: {
        type: 'number',
        title: 'Concurrency',
        description: 'Maximum concurrent requests per instance',
        default: 80,
      },
      timeout: {
        type: 'string',
        title: 'Timeout',
        description: 'Request timeout (e.g., 300s)',
        default: '300s',
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
      environmentVariables: {
        type: 'object',
        title: 'Environment Variables',
        description: 'Environment variables for the container',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['name', 'location', 'image'],
  },

  defaultConfig: {
    port: 8080,
    memory: '512Mi',
    cpu: '1',
    minInstances: 0,
    maxInstances: 100,
    concurrency: 80,
    timeout: '300s',
    allowUnauthenticated: true,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const runConfig = config as {
      name: string;
      location: string;
      image: string;
      port?: number;
      memory?: string;
      cpu?: string;
      minInstances?: number;
      maxInstances?: number;
      concurrency?: number;
      timeout?: string;
      vpcConnector?: string;
      allowUnauthenticated?: boolean;
      projectId?: string;
      projectName?: string;
      gatewayUrl?: string;
      environmentVariables?: Record<string, string>;
    };

    const location = runConfig.location;
    const image = runConfig.image;
    const port = runConfig.port || 8080;
    const memory = runConfig.memory || '512Mi';
    const cpu = runConfig.cpu || '1';
    const minInstances = runConfig.minInstances ?? 0;
    const maxInstances = runConfig.maxInstances ?? 100;
    const concurrency = runConfig.concurrency ?? 80;
    const timeout = runConfig.timeout || '300s';
    const allowUnauthenticated = runConfig.allowUnauthenticated ?? true;
    const projectId = runConfig.projectId || '${var.project_id}';
    const projectName = runConfig.projectName || '${var.project_name}';
    const gatewayUrl = runConfig.gatewayUrl || '';
    const additionalEnv = runConfig.environmentVariables || {};
    const labelsCode = generateLabelsCode(projectName, RESOURCE_TYPES.CLOUD_RUN);

    // Parse timeout to seconds (e.g., "300s" -> 300)
    const timeoutSeconds = parseInt(timeout.replace('s', ''), 10) || 300;

    // Build environment variables array
    const envVars: { name: string; value: string }[] = [
      { name: 'NODE_ENV', value: 'production' },
      { name: 'GCP_PROJECT_ID', value: projectId },
    ];
    if (projectName) {
      envVars.push({ name: 'STACKSOLO_PROJECT_NAME', value: projectName });
    }
    if (gatewayUrl) {
      envVars.push({ name: 'GATEWAY_URL', value: gatewayUrl });
    }
    for (const [key, value] of Object.entries(additionalEnv)) {
      envVars.push({ name: key, value });
    }

    // Generate env vars code, handling CDKTF references like ${kernelService.uri}
    const envVarsCode = envVars
      .map(e => {
        // Check if value is a CDKTF reference (e.g., ${kernelService.uri})
        // These are passed through directly as JavaScript code references
        if (e.value.startsWith('${') && e.value.endsWith('}')) {
          // Extract the reference without the ${} wrapper
          const cdktfRef = e.value.slice(2, -1);
          return `          { name: '${e.name}', value: ${cdktfRef} },`;
        }
        return `          { name: '${e.name}', value: '${e.value}' },`;
      })
      .join('\n');

    let code = `// Cloud Run service
const ${varName}Service = new CloudRunService(this, '${config.name}', {
  name: '${config.name}',
  location: '${location}',
  template: {
    spec: {
      containerConcurrency: ${concurrency},
      timeoutSeconds: ${timeoutSeconds},
      containers: [{
        image: '${image}',
        ports: [{ containerPort: ${port} }],
        resources: {
          limits: {
            memory: '${memory}',
            cpu: '${cpu}',
          },
        },
        env: [
${envVarsCode}
        ],
      }],
    },
    metadata: {
      annotations: {
        'autoscaling.knative.dev/minScale': '${minInstances}',
        'autoscaling.knative.dev/maxScale': '${maxInstances}',${runConfig.vpcConnector ? `
        'run.googleapis.com/vpc-access-connector': '${runConfig.vpcConnector}',
        'run.googleapis.com/vpc-access-egress': 'all-traffic',` : ''}
      },
    },
  },
  metadata: {
    annotations: {
      'run.googleapis.com/ingress': 'all',
    },
    ${labelsCode}
  },
  autogenerateRevisionName: true,
});`;

    // Add IAM binding for unauthenticated access
    if (allowUnauthenticated) {
      code += `

// Allow public access (allUsers)
new CloudRunServiceIamMember(this, '${config.name}-invoker', {
  project: ${varName}Service.project,
  location: ${varName}Service.location,
  service: ${varName}Service.name,
  role: 'roles/run.invoker',
  member: 'allUsers',
});`;
    }

    return {
      imports: [
        "import { CloudRunService } from '@cdktf/provider-google/lib/cloud-run-service';",
        "import { CloudRunServiceIamMember } from '@cdktf/provider-google/lib/cloud-run-service-iam-member';",
      ],
      code,
      outputs: [
        `export const ${varName}ServiceUrl = ${varName}Service.status.get(0).url;`,
        `export const ${varName}ServiceName = ${varName}Service.name;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const runConfig = config as { memory?: string; cpu?: string };
    const memory = runConfig.memory || '512Mi';
    const cpu = runConfig.cpu || '1';

    // Cloud Run pricing is based on CPU, memory, and requests
    const memoryGb = parseFloat(memory.replace('Mi', '')) / 1024 || 0.5;
    const cpuCount = parseFloat(cpu) || 1;

    // Rough estimate: $0.00002400 per vCPU-second, $0.00000250 per GB-second
    // Assuming 1M requests/month with 200ms average duration
    const estimatedSeconds = 1000000 * 0.2; // 1M requests * 200ms
    const cpuCost = estimatedSeconds * cpuCount * 0.00002400;
    const memoryCost = estimatedSeconds * memoryGb * 0.00000250;
    const requestCost = (1000000 / 1000000) * 0.40; // $0.40 per million requests

    const estimated = Math.round(cpuCost + memoryCost + requestCost);

    return {
      monthly: estimated,
      currency: 'USD',
      breakdown: [
        { item: 'CPU (estimated 1M requests @ 200ms)', amount: Math.round(cpuCost) },
        { item: 'Memory (estimated)', amount: Math.round(memoryCost) },
        { item: 'Requests (1M)', amount: Math.round(requestCost) },
      ],
    };
  },
});
