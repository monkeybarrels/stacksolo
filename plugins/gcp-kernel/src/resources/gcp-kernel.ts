import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

/**
 * GCP Kernel Resource
 *
 * A fully GCP-native kernel implementation using:
 * - Cloud Run for HTTP endpoints (auth, files, events)
 * - Cloud Pub/Sub for event messaging (replaces NATS/JetStream)
 * - Cloud Storage for file operations
 * - Firebase Admin SDK for token validation
 *
 * This is the serverless alternative to the K8s kernel which uses embedded NATS.
 */
export const gcpKernelResource = defineResource({
  id: 'gcp-kernel:gcp_kernel',
  provider: 'gcp-kernel',
  name: 'GCP Kernel',
  description: 'Serverless kernel using Cloud Run + Pub/Sub (alternative to NATS-based K8s kernel)',
  icon: 'cpu',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        description: 'Resource name for references (@gcp-kernel/<name>)',
        default: 'kernel',
      },
      location: {
        type: 'string',
        title: 'Region',
        description: 'GCP region (defaults to project region)',
      },
      cpu: {
        type: 'string',
        title: 'CPU',
        description: 'CPU allocation',
        default: '1',
        enum: ['1', '2', '4'],
      },
      memory: {
        type: 'string',
        title: 'Memory',
        description: 'Memory allocation',
        default: '512Mi',
        enum: ['256Mi', '512Mi', '1Gi', '2Gi'],
      },
      minInstances: {
        type: 'number',
        title: 'Min Instances',
        description: 'Minimum instances (0 for scale-to-zero)',
        default: 0,
      },
      maxInstances: {
        type: 'number',
        title: 'Max Instances',
        description: 'Maximum instances',
        default: 10,
      },
      firebaseProjectId: {
        type: 'string',
        title: 'Firebase Project ID',
        description: 'Firebase project for auth token validation',
      },
      storageBucket: {
        type: 'string',
        title: 'Storage Bucket',
        description: 'GCS bucket for file uploads',
      },
      eventRetentionDays: {
        type: 'number',
        title: 'Event Retention Days',
        description: 'How long to retain events in Pub/Sub',
        default: 7,
      },
    },
    required: ['firebaseProjectId', 'storageBucket'],
  },

  defaultConfig: {
    name: 'kernel',
    cpu: '1',
    memory: '512Mi',
    minInstances: 0,
    maxInstances: 10,
    eventRetentionDays: 7,
  },

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name as string);
    const name = (config.name as string) || 'kernel';
    const location = (config.location as string) || '${var.region}';
    const cpu = (config.cpu as string) || '1';
    const memory = (config.memory as string) || '512Mi';
    const minInstances = (config.minInstances as number) ?? 0;
    const maxInstances = (config.maxInstances as number) ?? 10;
    const firebaseProjectId = config.firebaseProjectId as string;
    const storageBucket = config.storageBucket as string;
    const eventRetentionDays = (config.eventRetentionDays as number) ?? 7;
    const projectId = (config.projectId as string) || '${var.project_id}';

    // Convert retention days to seconds
    const messageRetentionSeconds = eventRetentionDays * 24 * 60 * 60;

    const code = `// =============================================================================
// GCP Kernel - Serverless kernel using Cloud Run + Pub/Sub
// =============================================================================

// Enable required APIs
const ${varName}FirestoreApi = new ProjectService(this, '${name}-firestore-api', {
  service: 'firestore.googleapis.com',
  disableOnDestroy: false,
});

// Create Firestore database (required for access control)
// Using FIRESTORE_NATIVE mode for document-based access control
const ${varName}FirestoreDb = new FirestoreDatabase(this, '${name}-firestore-db', {
  project: '${projectId}',
  name: '(default)',
  locationId: '${location}',
  type: 'FIRESTORE_NATIVE',
  deleteProtectionState: 'DELETE_PROTECTION_DISABLED',
  dependsOn: [${varName}FirestoreApi],
});

// Service account for the GCP kernel
const ${varName}Sa = new ServiceAccount(this, '${name}-sa', {
  accountId: '${name}-gcp-kernel',
  displayName: 'GCP Kernel Service Account',
});

// Grant storage access for files service
new ProjectIamMember(this, '${name}-storage-iam', {
  project: '${projectId}',
  role: 'roles/storage.objectAdmin',
  member: \`serviceAccount:\${${varName}Sa.email}\`,
});

// Grant Pub/Sub access for events service
new ProjectIamMember(this, '${name}-pubsub-iam', {
  project: '${projectId}',
  role: 'roles/pubsub.editor',
  member: \`serviceAccount:\${${varName}Sa.email}\`,
});

// Grant Firestore/Datastore access for access control
new ProjectIamMember(this, '${name}-firestore-iam', {
  project: '${projectId}',
  role: 'roles/datastore.user',
  member: \`serviceAccount:\${${varName}Sa.email}\`,
});

// =============================================================================
// Pub/Sub Topics for Events
// =============================================================================

// Main events topic
const ${varName}EventsTopic = new PubsubTopic(this, '${name}-events-topic', {
  name: 'stacksolo-${name}-events',
  messageRetentionDuration: '${messageRetentionSeconds}s',
});

// Dead letter topic for failed message delivery
const ${varName}DlqTopic = new PubsubTopic(this, '${name}-dlq-topic', {
  name: 'stacksolo-${name}-events-dlq',
  messageRetentionDuration: '${messageRetentionSeconds * 2}s',
});

// =============================================================================
// Cloud Run Service
// =============================================================================

const ${varName}Service = new CloudRunV2Service(this, '${name}', {
  name: '${name}-gcp-kernel',
  location: '${location}',
  ingress: 'INGRESS_TRAFFIC_ALL',
  deletionProtection: false,

  template: {
    serviceAccount: ${varName}Sa.email,
    containers: [{
      image: 'gcr.io/${projectId}/stacksolo-gcp-kernel:latest',
      ports: { containerPort: 8080 },
      resources: {
        limits: {
          cpu: '${cpu}',
          memory: '${memory}',
        },
      },
      env: [
        // Note: PORT is automatically set by Cloud Run, don't specify it
        { name: 'GCP_PROJECT_ID', value: '${projectId}' },
        { name: 'FIREBASE_PROJECT_ID', value: '${firebaseProjectId}' },
        { name: 'GCS_BUCKET', value: '${storageBucket}' },
        { name: 'PUBSUB_EVENTS_TOPIC', value: \`\${${varName}EventsTopic.name}\` },
        { name: 'PUBSUB_DLQ_TOPIC', value: \`\${${varName}DlqTopic.name}\` },
        { name: 'KERNEL_TYPE', value: 'gcp' },
      ],
    }],
    scaling: {
      minInstanceCount: ${minInstances},
      maxInstanceCount: ${maxInstances},
    },
  },
});

// Allow unauthenticated access (kernel validates tokens internally)
new CloudRunV2ServiceIamMember(this, '${name}-public', {
  name: ${varName}Service.name,
  location: ${varName}Service.location,
  role: 'roles/run.invoker',
  member: 'allUsers',
});`;

    return {
      imports: [
        "import { ProjectService } from '@cdktf/provider-google/lib/project-service';",
        "import { FirestoreDatabase } from '@cdktf/provider-google/lib/firestore-database';",
        "import { ServiceAccount } from '@cdktf/provider-google/lib/service-account';",
        "import { ProjectIamMember } from '@cdktf/provider-google/lib/project-iam-member';",
        "import { CloudRunV2Service } from '@cdktf/provider-google/lib/cloud-run-v2-service';",
        "import { CloudRunV2ServiceIamMember } from '@cdktf/provider-google/lib/cloud-run-v2-service-iam-member';",
        "import { PubsubTopic } from '@cdktf/provider-google/lib/pubsub-topic';",
      ],
      code,
      outputs: [
        `export const ${varName}Url = ${varName}Service.uri;`,
        `export const ${varName}AuthUrl = \`\${${varName}Service.uri}/auth/validate\`;`,
        `export const ${varName}FilesUrl = \`\${${varName}Service.uri}/files\`;`,
        `export const ${varName}EventsUrl = \`\${${varName}Service.uri}/events\`;`,
        `export const ${varName}EventsTopic = ${varName}EventsTopic.name;`,
      ],
    };
  },

  estimateCost: (config: ResourceConfig) => {
    const minInstances = (config.minInstances as number) ?? 0;
    const cpu = parseFloat((config.cpu as string) || '1');
    const memory = parseFloat(((config.memory as string) || '512Mi').replace('Mi', '')) / 1024 || 0.5;

    // Cloud Run pricing
    let cloudRunCost = 0;
    if (minInstances > 0) {
      // Always-on instances
      const hoursPerMonth = 730;
      const cpuCost = minInstances * cpu * hoursPerMonth * 0.00002400 * 3600;
      const memoryCost = minInstances * memory * hoursPerMonth * 0.00000250 * 3600;
      cloudRunCost = cpuCost + memoryCost;
    } else {
      // Pay-per-use estimate (assuming 100k requests/month @ 200ms avg)
      const estimatedSeconds = 100000 * 0.2;
      cloudRunCost = estimatedSeconds * cpu * 0.00002400 + estimatedSeconds * memory * 0.00000250;
    }

    // Pub/Sub pricing (~$0.40/million messages, assume 100k messages/month)
    const pubsubCost = 0.04;

    return {
      monthly: Math.round(cloudRunCost + pubsubCost),
      currency: 'USD',
      breakdown: [
        { item: `Cloud Run (${minInstances > 0 ? 'always-on' : 'scale-to-zero'})`, amount: Math.round(cloudRunCost) },
        { item: 'Pub/Sub (~100k messages)', amount: Math.round(pubsubCost * 100) / 100 },
      ],
    };
  },
});
