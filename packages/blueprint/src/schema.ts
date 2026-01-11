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

/**
 * Firebase Emulators Configuration
 *
 * Configure Firebase emulator behavior for local development.
 * Supports data persistence between dev sessions.
 */
export interface FirebaseEmulatorsConfig {
  /** Enable Firebase emulators (default: true when gcpKernel is configured) */
  enabled?: boolean;
  /** Path to export emulator data on exit (e.g., ".stacksolo/emulator-data") */
  exportOnExit?: string;
  /** Path to import emulator data on start (e.g., ".stacksolo/emulator-data") */
  importOnStart?: string;
}

/**
 * Kubernetes Backend Configuration
 *
 * Configuration for deploying to any Kubernetes cluster (GKE, EKS, AKS, self-hosted).
 * Use with `backend: 'kubernetes'` in project config.
 */
export interface KubernetesConfig {
  /** Container registry configuration */
  registry: {
    /** Registry URL (e.g., "gcr.io/my-project", "docker.io/myuser", "123456.dkr.ecr.us-east-1.amazonaws.com") */
    url: string;
    /** K8s secret name for imagePullSecrets (optional if using node-level auth) */
    authSecret?: string;
  };

  /** Override auto-generated namespace (default: project name) */
  namespace?: string;

  /** Default replicas for deployments (default: 1) */
  replicas?: number;

  /** Resource defaults for all deployments */
  resources?: {
    defaultMemoryLimit?: string;    // e.g., "512Mi"
    defaultCpuLimit?: string;       // e.g., "500m"
    defaultMemoryRequest?: string;  // e.g., "256Mi"
    defaultCpuRequest?: string;     // e.g., "100m"
  };

  /** Ingress configuration for external access */
  ingress?: {
    /** Ingress class (e.g., "nginx", "traefik", "gce") */
    className?: string;
    /** Hostname for the ingress (e.g., "app.example.com") */
    host?: string;
    /** TLS secret name for HTTPS */
    tlsSecretName?: string;
    /** Additional annotations for the ingress */
    annotations?: Record<string, string>;
  };

  /** Kubernetes context to use (default: current context) */
  context?: string;

  /** Path to kubeconfig file (default: ~/.kube/config) */
  kubeconfig?: string;

  /** Helm chart output configuration (used with --helm flag) */
  helm?: {
    /** Chart version (default: 0.1.0) */
    chartVersion?: string;
    /** App version (default: latest or --tag value) */
    appVersion?: string;
    /** Override default values in values.yaml */
    values?: Record<string, unknown>;
  };
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
  /** Custom domain for HTTPS (requires DNS to point to load balancer IP) */
  domain?: string;
  /** Enable HTTPS with managed SSL certificate (requires domain) */
  enableHttps?: boolean;
  /** Redirect all HTTP traffic to HTTPS */
  redirectHttpToHttps?: boolean;
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

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface ProjectConfig {
  name: string;
  region: string;
  gcpProjectId: string;

  /**
   * Infrastructure backend to use for deployment.
   * - "pulumi" (default): Uses Pulumi Automation API
   * - "cdktf": Uses CDK for Terraform (GCP Cloud Run, Cloud Functions)
   * - "kubernetes": Deploys to any Kubernetes cluster (GKE, EKS, AKS, self-hosted)
   */
  backend?: 'pulumi' | 'cdktf' | 'kubernetes';

  /**
   * Package manager to use for installing dependencies in local dev containers.
   * - "npm" (default): Uses npm install --omit=dev
   * - "pnpm": Uses pnpm install --prod (handles workspace:* protocol)
   * - "yarn": Uses yarn install --production
   * - "bun": Uses bun install --production
   */
  packageManager?: PackageManager;

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

  // Firebase Emulators (local dev data persistence)
  firebaseEmulators?: FirebaseEmulatorsConfig;

  // Zero Trust configurations (IAP + dynamic access control)
  zeroTrust?: ZeroTrustConfig;
  zeroTrustAuth?: ZeroTrustAuthConfig;

  // Kubernetes-specific configuration (required when backend: 'kubernetes')
  kubernetes?: KubernetesConfig;

  // Network-scoped resources
  networks?: NetworkConfig[];
}

/**
 * Zero Trust configuration for IAP-protected backends
 */
export interface ZeroTrustConfig {
  iapWebBackends?: IapWebBackendConfig[];
}

export interface IapWebBackendConfig {
  name: string;
  backend: string;
  allowedMembers: string[];
  supportEmail: string;
  applicationTitle?: string;
}

/**
 * Zero Trust Auth configuration for dynamic access control
 * Uses Firestore via the GCP Kernel for runtime authorization
 */
export interface ZeroTrustAuthConfig {
  name: string;
  resources: string[];
  firestoreCollection?: string;
  adminRoles?: string[];
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
