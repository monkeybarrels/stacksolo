import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudFunction = defineResource({
  id: 'gcp:cloud_function',
  provider: 'gcp',
  name: 'Cloud Function',
  description: 'Serverless function that scales automatically',
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
      minInstances: {
        type: 'number',
        title: 'Min Instances',
        description: 'Minimum number of instances (0 for scale to zero)',
        default: 0,
        minimum: 0,
        maximum: 100,
      },
      maxInstances: {
        type: 'number',
        title: 'Max Instances',
        description: 'Maximum number of instances',
        default: 100,
        minimum: 1,
        maximum: 1000,
      },
      sourceDir: {
        type: 'string',
        title: 'Source Directory',
        description: 'Path to function source code',
        default: 'api',
      },
      allowUnauthenticated: {
        type: 'boolean',
        title: 'Allow Unauthenticated',
        description: 'Allow public access without authentication',
        default: true,
      },
    },
    required: ['name'],
  },

  defaultConfig: {
    location: 'us-central1',
    runtime: 'nodejs20',
    entryPoint: 'api',
    memory: '256Mi',
    minInstances: 0,
    maxInstances: 100,
    sourceDir: 'api',
    allowUnauthenticated: true,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const fnConfig = config as {
      name: string;
      location?: string;
      runtime?: string;
      entryPoint?: string;
      memory?: string;
      minInstances?: number;
      maxInstances?: number;
      sourceDir?: string;
      allowUnauthenticated?: boolean;
      trigger?: {
        type: 'http' | 'pubsub' | 'storage';
        topic?: string;
        bucket?: string;
      };
    };

    const location = fnConfig.location || 'us-central1';
    const runtime = fnConfig.runtime || 'nodejs20';
    const entryPoint = fnConfig.entryPoint || 'api';
    const memory = fnConfig.memory || '256Mi';
    const minInstances = fnConfig.minInstances ?? 0;
    const maxInstances = fnConfig.maxInstances ?? 100;
    const sourceDir = fnConfig.sourceDir || 'api';
    const allowUnauthenticated = fnConfig.allowUnauthenticated ?? true;
    const trigger = fnConfig.trigger || { type: 'http' };
    const isPubsub = trigger.type === 'pubsub' && trigger.topic;

    // Generate inline source code based on trigger type
    const inlineSourceCode = isPubsub
      ? `const functions = require('@google-cloud/functions-framework');

functions.cloudEvent('${entryPoint}', (cloudEvent) => {
  const message = cloudEvent.data?.message;
  if (message?.data) {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    console.log('Received message:', data);
  }
});`
      : `const functions = require('@google-cloud/functions-framework');

functions.http('${entryPoint}', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Function deployed by StackSolo',
    timestamp: new Date().toISOString()
  });
});`;

    // Cloud Functions Gen2 uses Cloud Run under the hood
    // Source must be a zip archive uploaded to GCS
    let code = `// Create storage bucket for function source
const ${varName}SourceBucket = new gcp.storage.Bucket("${config.name}-source", {
  location: "${location}",
  uniformBucketLevelAccess: true,
  forceDestroy: true,
});

// Create source archive from inline files
const ${varName}SourceArchive = new gcp.storage.BucketObject("${config.name}-source-zip", {
  bucket: ${varName}SourceBucket.name,
  name: "source.zip",
  source: new pulumi.asset.AssetArchive({
    "index.js": new pulumi.asset.StringAsset(\`${inlineSourceCode}\`),
    "package.json": new pulumi.asset.StringAsset(JSON.stringify({
      name: "${config.name}",
      version: "1.0.0",
      main: "index.js",
      dependencies: {
        "@google-cloud/functions-framework": "^3.0.0"
      }
    }, null, 2)),
  }),
});

const ${varName}Function = new gcp.cloudfunctionsv2.Function("${config.name}", {
  name: "${config.name}",
  location: "${location}",
  buildConfig: {
    runtime: "${runtime}",
    entryPoint: "${entryPoint}",
    source: {
      storageSource: {
        bucket: ${varName}SourceBucket.name,
        object: ${varName}SourceArchive.name,
      },
    },
  },
  serviceConfig: {
    maxInstanceCount: ${maxInstances},
    minInstanceCount: ${minInstances},
    availableMemory: "${memory}",
    timeoutSeconds: 60,
    allTrafficOnLatestRevision: true,
  },`;

    // Add event trigger for pubsub
    if (isPubsub) {
      const topicVarName = toVariableName(trigger.topic!);
      code += `
  eventTrigger: {
    triggerRegion: "${location}",
    eventType: "google.cloud.pubsub.topic.v1.messagePublished",
    pubsubTopic: ${topicVarName}Topic.id,
    retryPolicy: "RETRY_POLICY_RETRY",
  },`;
    }

    code += `
});`;

    // Only add unauthenticated access for HTTP-triggered functions, not Pub/Sub
    // Pub/Sub functions are invoked via Eventarc, not HTTP
    if (allowUnauthenticated && !isPubsub) {
      code += `

// Allow unauthenticated access (HTTP trigger only)
const ${varName}Invoker = new gcp.cloudfunctionsv2.FunctionIamMember("${config.name}-invoker", {
  project: ${varName}Function.project,
  location: ${varName}Function.location,
  cloudFunction: ${varName}Function.name,
  role: "roles/cloudfunctions.invoker",
  member: "allUsers",
}, { dependsOn: [${varName}Function] });`;
    }

    return {
      imports: [
        "import * as gcp from '@pulumi/gcp';",
        "import * as pulumi from '@pulumi/pulumi';",
      ],
      code,
      outputs: [
        `export const ${varName}FunctionUrl = ${varName}Function.serviceConfig.apply(sc => sc?.uri || "");`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const fnConfig = config as { memory?: string };
    const memory = fnConfig.memory || '256Mi';

    // Rough estimation based on memory tier
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
