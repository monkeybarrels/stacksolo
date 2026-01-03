/**
 * StackSolo Blueprint Schema
 * TypeScript interfaces for stacksolo.config.json
 */

// =============================================================================
// Project-Level Resources (Global)
// =============================================================================

export interface ServiceAccountConfig {
  name: string;
  displayName?: string;
  description?: string;
  createKey?: boolean;
}

export interface BucketConfig {
  name: string;
  location?: string;
  storageClass?: 'STANDARD' | 'NEARLINE' | 'COLDLINE' | 'ARCHIVE';
  versioning?: boolean;
  uniformBucketLevelAccess?: boolean;
  publicAccess?: boolean;
  cors?: {
    origins: string[];
    methods: string[];
    responseHeaders?: string[];
    maxAgeSeconds?: number;
  };
  lifecycle?: {
    deleteAfterDays?: number;
    archiveAfterDays?: number;
  };
}

export interface TopicConfig {
  name: string;
  messageRetentionDuration?: string;
  labels?: Record<string, string>;
}

export interface QueueConfig {
  name: string;
  location?: string;
  rateLimits?: {
    maxDispatchesPerSecond?: number;
    maxConcurrentDispatches?: number;
  };
  retryConfig?: {
    maxAttempts?: number;
    minBackoff?: string;
    maxBackoff?: string;
  };
}

export interface SecretConfig {
  name: string;
  value?: string;
  labels?: Record<string, string>;
}

export interface CronConfig {
  name: string;
  schedule: string;
  timezone?: string;
  description?: string;
  target: string; // "network/resource" or "@container/name" or "@function/name"
  path?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: string;
  headers?: Record<string, string>;
  retryCount?: number;
  attemptDeadline?: string;
}

// =============================================================================
// Network-Level Resources (VPC-bound)
// =============================================================================

export interface ContainerConfig {
  name: string;
  image?: string;
  port?: number;
  memory?: string;
  cpu?: string;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  timeout?: string;
  allowUnauthenticated?: boolean;
  env?: Record<string, string>;
  secrets?: Record<string, string>; // Maps env var to @secret/name
  serviceAccount?: string;
  vpcConnector?: string;
  labels?: Record<string, string>;
}

export interface FunctionConfig {
  name: string;
  sourceDir?: string;
  entryPoint?: string;
  runtime?: 'nodejs20' | 'nodejs18' | 'python311' | 'python310' | 'go121' | 'go120';
  memory?: string;
  minInstances?: number;
  maxInstances?: number;
  timeout?: number;
  allowUnauthenticated?: boolean;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  serviceAccount?: string;
  vpcConnector?: string;
  labels?: Record<string, string>;
  trigger?: {
    type: 'http' | 'pubsub' | 'storage';
    topic?: string; // For pubsub trigger
    bucket?: string; // For storage trigger
    event?: string; // For storage trigger (e.g., 'finalize')
  };
}

export interface DatabaseConfig {
  name: string;
  databaseVersion?: 'POSTGRES_15' | 'POSTGRES_14' | 'MYSQL_8_0' | 'MYSQL_5_7';
  tier?: string;
  diskSize?: number;
  diskType?: 'PD_SSD' | 'PD_HDD';
  databaseName?: string;
  enablePublicIp?: boolean;
  requireSsl?: boolean;
  backupEnabled?: boolean;
  backupStartTime?: string;
  maintenanceWindowDay?: number;
  maintenanceWindowHour?: number;
  flags?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface CacheConfig {
  name: string;
  tier?: 'BASIC' | 'STANDARD_HA';
  memorySizeGb?: number;
  redisVersion?: string;
  authEnabled?: boolean;
  transitEncryptionMode?: 'DISABLED' | 'SERVER_AUTHENTICATION';
  labels?: Record<string, string>;
}

export interface UIConfig {
  name: string;
  sourceDir?: string;             // e.g., './web' - defaults to 'ui/<name>'
  framework?: 'react' | 'vue' | 'sveltekit' | 'html';  // Default: detect from package.json
  buildCommand?: string;          // Default: 'npm run build'
  buildOutputDir?: string;        // Default: 'dist' or 'build'
  indexDocument?: string;         // Default: 'index.html'
  errorDocument?: string;         // Default: 'index.html' (for SPA routing)
}

export interface KernelConfig {
  name: string;
  memory?: string;                // Default: '512Mi'
  cpu?: string;                   // Default: '1'
  minInstances?: number;          // Default: 0
  maxInstances?: number;          // Default: 10
  firebaseProjectId?: string;     // For auth validation
  gcsBucket?: string;             // For file operations
  env?: Record<string, string>;   // Additional environment variables
}

/**
 * GCP Kernel Configuration
 *
 * A fully GCP-native kernel using Cloud Run + Pub/Sub.
 * This is the serverless alternative to the NATS-based kernel.
 * Use this when deploying to GCP without Kubernetes.
 */
export interface GcpKernelConfig {
  name: string;
  memory?: string;                // Default: '512Mi'
  cpu?: string;                   // Default: '1'
  minInstances?: number;          // Default: 0 (scale-to-zero)
  maxInstances?: number;          // Default: 10
  firebaseProjectId: string;      // Required: Firebase project for auth validation
  storageBucket: string;          // Required: GCS bucket for file operations
  eventRetentionDays?: number;    // Default: 7 - How long to retain events in Pub/Sub
}

export interface WebAdminConfig {
  enabled: boolean;               // Whether to start web admin with `stacksolo dev`
  port?: number;                  // Default: 3000
}

export interface SubnetConfig {
  name: string;
  ipCidrRange: string;
  region?: string;
  privateGoogleAccess?: boolean;
  flowLogs?: boolean;
  secondaryRanges?: Array<{
    rangeName: string;
    ipCidrRange: string;
  }>;
}

export interface FirewallRuleConfig {
  name: string;
  direction?: 'INGRESS' | 'EGRESS';
  priority?: number;
  action?: 'allow' | 'deny';
  protocol?: string;
  ports?: string[];
  sourceRanges?: string[];
  targetTags?: string[];
  description?: string;
}

export interface LoadBalancerRouteConfig {
  path: string;
  backend: string;
}

export interface LoadBalancerConfig {
  name: string;
  routes?: LoadBalancerRouteConfig[];
}

export interface NetworkConfig {
  name: string;
  description?: string;
  autoCreateSubnetworks?: boolean;
  routingMode?: 'REGIONAL' | 'GLOBAL';
  mtu?: number;

  // Use an existing VPC instead of creating a new one
  existing?: boolean;

  // Load balancer configuration
  loadBalancer?: LoadBalancerConfig;

  // Subnets
  subnets?: SubnetConfig[];

  // Firewall rules
  firewallRules?: FirewallRuleConfig[];

  // Resources within this network
  containers?: ContainerConfig[];
  functions?: FunctionConfig[];
  databases?: DatabaseConfig[];
  caches?: CacheConfig[];
  uis?: UIConfig[];
}

// =============================================================================
// Project Configuration
// =============================================================================

export interface ProjectConfig {
  name: string;
  region: string;
  gcpProjectId: string;

  /**
   * Infrastructure backend to use for deployment.
   * - "pulumi" (default): Uses Pulumi Automation API
   * - "cdktf": Uses CDK for Terraform (only supports function-api template)
   */
  backend?: 'pulumi' | 'cdktf';

  /**
   * Plugins to load for this project.
   * These are npm package names that export Plugin objects.
   * Example: ["@stacksolo/plugin-gcp-cdktf", "@stacksolo/plugin-kernel"]
   */
  plugins?: string[];

  // Global resources
  serviceAccount?: ServiceAccountConfig;
  buckets?: BucketConfig[];
  topics?: TopicConfig[];
  queues?: QueueConfig[];
  secrets?: SecretConfig[];
  crons?: CronConfig[];

  // Kernel (one per project - shared auth/files/events service)
  // Use `kernel` for NATS-based kernel (requires K8s or container with NATS)
  // Use `gcpKernel` for GCP-native kernel (Cloud Run + Pub/Sub, serverless)
  kernel?: KernelConfig;
  gcpKernel?: GcpKernelConfig;

  // Web Admin UI (optional local dev dashboard)
  webAdmin?: WebAdminConfig;

  // Network-scoped resources
  networks?: NetworkConfig[];
}

// =============================================================================
// Root Configuration
// =============================================================================

export interface StackSoloConfig {
  $schema?: string;
  version?: string;
  project: ProjectConfig;
}

// =============================================================================
// Resolved Resources (Internal)
// =============================================================================

export interface ResolvedResource {
  id: string;           // Unique identifier: "bucket-uploads", "container-api"
  type: string;         // Resource type: "gcp:storage_bucket", "gcp:cloud_run"
  name: string;         // User-defined name
  config: Record<string, unknown>;
  dependsOn: string[];  // IDs of resources this depends on
  network?: string;     // Network name if VPC-bound
}

export interface ResolvedConfig {
  project: {
    name: string;
    region: string;
    gcpProjectId: string;
  };
  resources: ResolvedResource[];
  order: string[];      // Topologically sorted resource IDs
}

// =============================================================================
// Reference Types
// =============================================================================

export type ReferenceType =
  | 'secret'
  | 'database'
  | 'bucket'
  | 'cache'
  | 'container'
  | 'function'
  | 'topic'
  | 'queue'
  | 'network'
  | 'ui'
  | 'kernel'
  | 'gcp-kernel';

export interface Reference {
  type: ReferenceType;
  name: string;
  property?: string;
  network?: string;     // For network-scoped resources
}

// =============================================================================
// Validation
// =============================================================================

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
