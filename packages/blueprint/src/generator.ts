/**
 * StackSolo Blueprint Generator
 * Generate Pulumi code from resolved config
 */

import type { ResolvedResource, ResolvedConfig } from './schema.js';
import { resolveEnvReferences } from './references.js';
import { getResourcesInOrder } from './dependencies.js';

/**
 * Generated Pulumi code structure
 */
export interface GeneratedCode {
  imports: string[];
  code: string;
  outputs: string[];
}

/**
 * Resource type to Pulumi generator mapping
 */
type ResourceGenerator = (resource: ResolvedResource) => GeneratedCode;

/**
 * Convert a resource name to a valid variable name
 */
function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

// =============================================================================
// Resource Generators
// =============================================================================

const generators: Record<string, ResourceGenerator> = {
  'gcp:storage_bucket': generateBucket,
  'gcp:secret': generateSecret,
  'gcp:pubsub_topic': generateTopic,
  'gcp:cloud_tasks': generateQueue,
  'gcp:scheduler_job': generateCron,
  'gcp:service_account': generateServiceAccount,
  'gcp:vpc_network': generateVpcNetwork,
  'gcp:vpc_subnet': generateVpcSubnet,
  'gcp:firewall': generateFirewall,
  'gcp:cloud_run': generateCloudRun,
  'gcp:cloud_function': generateCloudFunction,
  'gcp:cloud_sql': generateCloudSql,
  'gcp:memorystore': generateMemorystore,
};

function generateBucket(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Bucket = new gcp.storage.Bucket("${resource.name}", {
  name: "${resource.name}",
  location: "${config.location || 'us-central1'}",
  storageClass: "${config.storageClass || 'STANDARD'}",
  uniformBucketLevelAccess: ${config.uniformBucketLevelAccess ?? true},`;

  if (config.versioning) {
    code += `\n  versioning: { enabled: true },`;
  }

  if (config.cors) {
    const cors = config.cors as { origins: string[]; methods: string[] };
    code += `\n  cors: [{
    origins: ${JSON.stringify(cors.origins)},
    methods: ${JSON.stringify(cors.methods)},
  }],`;
  }

  code += '\n});';

  if (config.publicAccess) {
    code += `

// Make bucket publicly readable
const ${varName}BucketIam = new gcp.storage.BucketIAMMember("${resource.name}-public", {
  bucket: ${varName}Bucket.name,
  role: "roles/storage.objectViewer",
  member: "allUsers",
});`;
  }

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}BucketName = ${varName}Bucket.name;`,
      `export const ${varName}BucketUrl = pulumi.interpolate\`gs://\${${varName}Bucket.name}\`;`,
    ],
  };
}

function generateSecret(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Secret = new gcp.secretmanager.Secret("${resource.name}", {
  secretId: "${resource.name}",
  replication: { auto: {} },`;

  if (config.labels) {
    code += `\n  labels: ${JSON.stringify(config.labels)},`;
  }

  code += '\n});';

  if (config.value) {
    code += `

const ${varName}SecretVersion = new gcp.secretmanager.SecretVersion("${resource.name}-version", {
  secret: ${varName}Secret.id,
  secretData: "${config.value}",
});`;
  }

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}SecretId = ${varName}Secret.secretId;`,
      `export const ${varName}SecretName = ${varName}Secret.name;`,
    ],
  };
}

function generateTopic(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Topic = new gcp.pubsub.Topic("${resource.name}", {
  name: "${resource.name}",`;

  if (config.messageRetentionDuration) {
    code += `\n  messageRetentionDuration: "${config.messageRetentionDuration}",`;
  }

  if (config.labels) {
    code += `\n  labels: ${JSON.stringify(config.labels)},`;
  }

  code += '\n});';

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}TopicName = ${varName}Topic.name;`,
      `export const ${varName}TopicId = ${varName}Topic.id;`,
    ],
  };
}

function generateQueue(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Queue = new gcp.cloudtasks.Queue("${resource.name}", {
  name: "${resource.name}",
  location: "${config.location || 'us-central1'}",`;

  const rateLimits = config.rateLimits as Record<string, number> | undefined;
  if (rateLimits) {
    code += `\n  rateLimits: {`;
    if (rateLimits.maxDispatchesPerSecond) {
      code += `\n    maxDispatchesPerSecond: ${rateLimits.maxDispatchesPerSecond},`;
    }
    if (rateLimits.maxConcurrentDispatches) {
      code += `\n    maxConcurrentDispatches: ${rateLimits.maxConcurrentDispatches},`;
    }
    code += `\n  },`;
  }

  code += '\n});';

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}QueueName = ${varName}Queue.name;`,
      `export const ${varName}QueueId = ${varName}Queue.id;`,
    ],
  };
}

function generateCron(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Scheduler = new gcp.cloudscheduler.Job("${resource.name}", {
  name: "${resource.name}",
  schedule: "${config.schedule}",
  timeZone: "${config.timezone || 'UTC'}",`;

  if (config.description) {
    code += `\n  description: "${config.description}",`;
  }

  // HTTP target - will be resolved from target reference
  code += `\n  httpTarget: {
    uri: "", // TODO: resolve from target reference
    httpMethod: "${config.httpMethod || 'GET'}",`;

  if (config.httpBody) {
    code += `\n    body: Buffer.from("${config.httpBody}").toString("base64"),`;
  }

  code += `\n  },`;

  code += '\n});';

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}SchedulerName = ${varName}Scheduler.name;`,
    ],
  };
}

function generateServiceAccount(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}ServiceAccount = new gcp.serviceaccount.Account("${resource.name}", {
  accountId: "${resource.name}",`;

  if (config.displayName) {
    code += `\n  displayName: "${config.displayName}",`;
  }

  if (config.description) {
    code += `\n  description: "${config.description}",`;
  }

  code += '\n});';

  if (config.createKey) {
    code += `

const ${varName}ServiceAccountKey = new gcp.serviceaccount.Key("${resource.name}-key", {
  serviceAccountId: ${varName}ServiceAccount.name,
});`;
  }

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}ServiceAccountEmail = ${varName}ServiceAccount.email;`,
      `export const ${varName}ServiceAccountId = ${varName}ServiceAccount.id;`,
    ],
  };
}

function generateVpcNetwork(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Network = new gcp.compute.Network("${resource.name}", {
  name: "${resource.name}",
  autoCreateSubnetworks: ${config.autoCreateSubnetworks ?? false},
  routingMode: "${config.routingMode || 'REGIONAL'}",`;

  if (config.mtu) {
    code += `\n  mtu: ${config.mtu},`;
  }

  if (config.description) {
    code += `\n  description: "${config.description}",`;
  }

  code += '\n});';

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}NetworkName = ${varName}Network.name;`,
      `export const ${varName}NetworkId = ${varName}Network.id;`,
      `export const ${varName}NetworkSelfLink = ${varName}Network.selfLink;`,
    ],
  };
}

function generateVpcSubnet(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;
  const networkVarName = toVariableName(config.network as string);

  let code = `const ${varName}Subnet = new gcp.compute.Subnetwork("${resource.name}", {
  name: "${resource.name}",
  network: ${networkVarName}Network.selfLink,
  region: "${config.region || 'us-central1'}",
  ipCidrRange: "${config.ipCidrRange}",
  privateIpGoogleAccess: ${config.privateIpGoogleAccess ?? true},`;

  if (config.logConfig) {
    code += `\n  logConfig: {
    aggregationInterval: "INTERVAL_5_SEC",
    flowSampling: 0.5,
    metadata: "INCLUDE_ALL_METADATA",
  },`;
  }

  code += '\n});';

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}SubnetName = ${varName}Subnet.name;`,
      `export const ${varName}SubnetSelfLink = ${varName}Subnet.selfLink;`,
    ],
  };
}

function generateFirewall(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;
  const networkVarName = toVariableName(config.network as string);

  const action = config.action || 'allow';
  const ruleType = action === 'allow' ? 'allows' : 'denies';

  let code = `const ${varName}Firewall = new gcp.compute.Firewall("${resource.name}", {
  name: "${resource.name}",
  network: ${networkVarName}Network.selfLink,
  direction: "${config.direction || 'INGRESS'}",
  priority: ${config.priority ?? 1000},
  ${ruleType}: [{
    protocol: "${config.protocol || 'tcp'}",`;

  if (config.ports) {
    code += `\n    ports: ${JSON.stringify(config.ports)},`;
  }

  code += `\n  }],`;

  if (config.sourceRanges) {
    code += `\n  sourceRanges: ${JSON.stringify(config.sourceRanges)},`;
  }

  if (config.targetTags) {
    code += `\n  targetTags: ${JSON.stringify(config.targetTags)},`;
  }

  code += '\n});';

  return {
    imports: ["import * as gcp from '@pulumi/gcp';"],
    code,
    outputs: [
      `export const ${varName}FirewallName = ${varName}Firewall.name;`,
    ],
  };
}

function generateCloudRun(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Service = new gcp.cloudrunv2.Service("${resource.name}", {
  name: "${resource.name}",
  location: "${config.location || 'us-central1'}",
  template: {
    containers: [{
      image: "${config.image || 'gcr.io/cloudrun/hello'}",
      ports: [{ containerPort: ${config.port || 8080} }],
      resources: {
        limits: {
          memory: "${config.memory || '512Mi'}",
          cpu: "${config.cpu || '1'}",
        },
      },`;

  // Handle env variables with reference resolution
  if (config.env) {
    const env = config.env as Record<string, string>;
    const resolvedEnv = resolveEnvReferences(env);
    code += `\n      envs: [`;
    for (const [key, value] of Object.entries(resolvedEnv)) {
      if (value.startsWith('${')) {
        // This is a Pulumi interpolation
        code += `\n        { name: "${key}", value: ${value.slice(2, -1)} },`;
      } else {
        code += `\n        { name: "${key}", value: "${value}" },`;
      }
    }
    code += `\n      ],`;
  }

  code += `\n    }],
    scaling: {
      minInstanceCount: ${config.minInstances ?? 0},
      maxInstanceCount: ${config.maxInstances ?? 100},
    },`;

  if (config.timeout) {
    code += `\n    timeout: "${config.timeout}",`;
  }

  if (config.serviceAccount) {
    code += `\n    serviceAccount: "${config.serviceAccount}",`;
  }

  code += `\n  },
});`;

  if (config.allowUnauthenticated !== false) {
    code += `

const ${varName}Invoker = new gcp.cloudrunv2.ServiceIamMember("${resource.name}-invoker", {
  name: ${varName}Service.name,
  location: ${varName}Service.location,
  role: "roles/run.invoker",
  member: "allUsers",
});`;
  }

  return {
    imports: [
      "import * as gcp from '@pulumi/gcp';",
      "import * as pulumi from '@pulumi/pulumi';",
    ],
    code,
    outputs: [
      `export const ${varName}ServiceUrl = ${varName}Service.uri;`,
      `export const ${varName}ServiceName = ${varName}Service.name;`,
    ],
  };
}

function generateCloudFunction(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}SourceBucket = new gcp.storage.Bucket("${resource.name}-source", {
  location: "${config.location || 'us-central1'}",
  uniformBucketLevelAccess: true,
});

const ${varName}Function = new gcp.cloudfunctionsv2.Function("${resource.name}", {
  name: "${resource.name}",
  location: "${config.location || 'us-central1'}",
  buildConfig: {
    runtime: "${config.runtime || 'nodejs20'}",
    entryPoint: "${config.entryPoint || resource.name}",
    source: {
      storageSource: {
        bucket: ${varName}SourceBucket.name,
        object: "function-source.zip",
      },
    },
  },
  serviceConfig: {
    maxInstanceCount: ${config.maxInstances ?? 100},
    minInstanceCount: ${config.minInstances ?? 0},
    availableMemory: "${config.memory || '256Mi'}",
    timeoutSeconds: ${config.timeout || 60},
    allTrafficOnLatestRevision: true,`;

  if (config.env) {
    const env = config.env as Record<string, string>;
    code += `\n    environmentVariables: ${JSON.stringify(env)},`;
  }

  code += `\n  },
});`;

  if (config.allowUnauthenticated !== false) {
    code += `

const ${varName}Invoker = new gcp.cloudfunctionsv2.FunctionIamMember("${resource.name}-invoker", {
  project: ${varName}Function.project,
  location: ${varName}Function.location,
  cloudFunction: ${varName}Function.name,
  role: "roles/cloudfunctions.invoker",
  member: "allUsers",
});`;
  }

  return {
    imports: [
      "import * as gcp from '@pulumi/gcp';",
      "import * as pulumi from '@pulumi/pulumi';",
    ],
    code,
    outputs: [
      `export const ${varName}FunctionUrl = ${varName}Function.serviceConfig.apply(sc => sc?.uri || "");`,
      `export const ${varName}FunctionName = ${varName}Function.name;`,
    ],
  };
}

function generateCloudSql(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Instance = new gcp.sql.DatabaseInstance("${resource.name}", {
  name: "${resource.name}",
  region: "${config.region || 'us-central1'}",
  databaseVersion: "${config.databaseVersion || 'POSTGRES_15'}",
  settings: {
    tier: "${config.tier || 'db-f1-micro'}",
    diskSize: ${config.diskSize || 10},
    diskType: "${config.diskType || 'PD_SSD'}",
    ipConfiguration: {
      ipv4Enabled: ${config.enablePublicIp ?? false},
      requireSsl: ${config.requireSsl ?? true},
    },`;

  if (config.backupEnabled !== false) {
    code += `\n    backupConfiguration: {
      enabled: true,
      startTime: "${config.backupStartTime || '02:00'}",
    },`;
  }

  code += `\n  },
  deletionProtection: false,
});

const ${varName}Database = new gcp.sql.Database("${resource.name}-db", {
  name: "${config.databaseName || resource.name}",
  instance: ${varName}Instance.name,
});

const ${varName}User = new gcp.sql.User("${resource.name}-user", {
  name: "${resource.name}-user",
  instance: ${varName}Instance.name,
  password: pulumi.secret("change-me-in-production"),
});`;

  return {
    imports: [
      "import * as gcp from '@pulumi/gcp';",
      "import * as pulumi from '@pulumi/pulumi';",
    ],
    code,
    outputs: [
      `export const ${varName}InstanceName = ${varName}Instance.name;`,
      `export const ${varName}ConnectionString = pulumi.interpolate\`postgres://\${${varName}User.name}:\${${varName}User.password}@/\${${varName}Database.name}?host=/cloudsql/\${${varName}Instance.connectionName}\`;`,
      `export const ${varName}PrivateIp = ${varName}Instance.privateIpAddress;`,
    ],
  };
}

function generateMemorystore(resource: ResolvedResource): GeneratedCode {
  const varName = toVariableName(resource.name);
  const config = resource.config as Record<string, unknown>;

  let code = `const ${varName}Redis = new gcp.redis.Instance("${resource.name}", {
  name: "${resource.name}",
  region: "${config.region || 'us-central1'}",
  tier: "${config.tier || 'BASIC'}",
  memorySizeGb: ${config.memorySizeGb || 1},
  redisVersion: "${config.redisVersion || 'REDIS_7_0'}",`;

  if (config.authEnabled) {
    code += `\n  authEnabled: true,`;
  }

  if (config.authorizedNetwork) {
    const networkVarName = toVariableName(config.authorizedNetwork as string);
    code += `\n  authorizedNetwork: ${networkVarName}Network.selfLink,`;
  }

  code += '\n});';

  return {
    imports: [
      "import * as gcp from '@pulumi/gcp';",
      "import * as pulumi from '@pulumi/pulumi';",
    ],
    code,
    outputs: [
      `export const ${varName}RedisHost = ${varName}Redis.host;`,
      `export const ${varName}RedisPort = ${varName}Redis.port;`,
      `export const ${varName}RedisConnectionString = pulumi.interpolate\`redis://\${${varName}Redis.host}:\${${varName}Redis.port}\`;`,
    ],
  };
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate Pulumi code from a resolved config
 */
export function generateFromConfig(resolved: ResolvedConfig): GeneratedCode {
  const allImports = new Set<string>();
  const codeBlocks: string[] = [];
  const allOutputs: string[] = [];

  // Get resources in dependency order
  const orderedResources = getResourcesInOrder(resolved);

  // Add Pulumi import by default
  allImports.add("import * as pulumi from '@pulumi/pulumi';");

  for (const resource of orderedResources) {
    const generator = generators[resource.type];
    if (!generator) {
      console.warn(`No generator for resource type: ${resource.type}`);
      continue;
    }

    const generated = generator(resource);

    // Collect imports
    for (const imp of generated.imports) {
      allImports.add(imp);
    }

    // Add code block with comment
    codeBlocks.push(`// ${resource.type}: ${resource.name}`);
    codeBlocks.push(generated.code);
    codeBlocks.push('');

    // Collect outputs
    allOutputs.push(...generated.outputs);
  }

  return {
    imports: [...allImports],
    code: codeBlocks.join('\n'),
    outputs: allOutputs,
  };
}

/**
 * Generate a complete Pulumi program
 */
export function generatePulumiProgram(resolved: ResolvedConfig): string {
  const generated = generateFromConfig(resolved);

  const lines: string[] = [];

  // Imports
  lines.push(...generated.imports);
  lines.push('');

  // Project config
  lines.push(`// Project: ${resolved.project.name}`);
  lines.push(`// Region: ${resolved.project.region}`);
  lines.push(`// GCP Project: ${resolved.project.gcpProjectId}`);
  lines.push('');

  // Resource code
  lines.push(generated.code);

  // Outputs
  lines.push('// Outputs');
  lines.push(...generated.outputs);

  return lines.join('\n');
}

/**
 * Generate Pulumi.yaml config file
 */
export function generatePulumiYaml(resolved: ResolvedConfig): string {
  return `name: ${resolved.project.name}
runtime: nodejs
description: Infrastructure for ${resolved.project.name}

config:
  gcp:project: ${resolved.project.gcpProjectId}
  gcp:region: ${resolved.project.region}
`;
}
