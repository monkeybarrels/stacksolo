// JSON Schema type (simplified for our needs)
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  items?: JSONSchemaProperty;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  properties?: Record<string, JSONSchemaProperty>;
  additionalProperties?: boolean | JSONSchemaProperty;
}

// Provider types
export interface Provider {
  id: string;
  name: string;
  icon: string;
  auth: AuthMethod;
  resources: ResourceType[];
}

export interface AuthMethod {
  type: 'cli' | 'service_account' | 'api_key' | 'oauth';
  command?: string;
  instructions: string;
  validate: () => Promise<boolean>;
}

// Resource types
export interface ResourceType {
  id: string; // e.g., 'gcp:storage_bucket'
  provider: string; // e.g., 'gcp'
  name: string;
  description: string;
  icon: string;
  configSchema: JSONSchema;
  defaultConfig: Record<string, unknown>;
  generate: (config: ResourceConfig) => GeneratedCode;
  estimateCost?: (config: ResourceConfig) => CostEstimate;
}

export interface ResourceConfig {
  name: string;
  [key: string]: unknown;
}

export interface GeneratedCode {
  imports: string[];
  code: string;
  outputs?: string[];
}

export interface CostEstimate {
  monthly: number;
  currency: string;
  breakdown?: CostBreakdownItem[];
}

export interface CostBreakdownItem {
  item: string;
  amount: number;
}

// App Pattern types
export interface AppPatternPrompt {
  id: string;
  type: 'boolean' | 'string' | 'select';
  label: string;
  description?: string;
  options?: { value: string; label: string }[]; // for select type
  default?: unknown;
}

export interface InfrastructureSpec {
  type: string; // e.g., 'gcp:storage_bucket'
  name: string; // resource name
  config: Record<string, unknown>;
}

export interface BuildSpec {
  generateDockerfile: (projectPath: string) => Promise<string> | string;
  preBuildCommands?: string[];
  postBuildCommands?: string[];
}

export interface AppPattern {
  id: string; // e.g., 'nextjs-cloud-run'
  name: string; // e.g., 'Next.js on Cloud Run'
  description: string;
  icon: string;
  provider: string; // e.g., 'gcp'
  detect: (projectPath: string) => Promise<boolean>;
  prompts: AppPatternPrompt[];
  infrastructure: (answers: Record<string, unknown>) => InfrastructureSpec[];
  build: BuildSpec;
  env: (
    resources: Record<string, { outputs?: Record<string, string> }>
  ) => Record<string, string>;
}

export interface DefineAppPatternInput {
  id: string;
  name: string;
  description: string;
  icon: string;
  provider: string;
  detect: (projectPath: string) => Promise<boolean>;
  prompts: AppPatternPrompt[];
  infrastructure: (answers: Record<string, unknown>) => InfrastructureSpec[];
  build: BuildSpec;
  env: (
    resources: Record<string, { outputs?: Record<string, string> }>
  ) => Record<string, string>;
}

// Output formatter types (for plugins that transform manifest output)
export interface OutputFormatter {
  /** Formatter ID (e.g., 'helm', 'kustomize') */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Transform resolved resources to output format */
  generate: (options: OutputFormatterOptions) => GeneratedOutput[];
}

export interface OutputFormatterOptions {
  /** Project name from config */
  projectName: string;
  /** Resolved K8s resources */
  resources: ResolvedResource[];
  /** Formatter-specific config (e.g., helm settings) */
  config: Record<string, unknown>;
  /** Output directory path */
  outputDir: string;
}

export interface ResolvedResource {
  /** Unique identifier (e.g., 'k8s:deployment-api') */
  id: string;
  /** Resource type (e.g., 'k8s:deployment') */
  type: string;
  /** User-defined name */
  name: string;
  /** Resource configuration */
  config: Record<string, unknown>;
  /** IDs of resources this depends on */
  dependsOn: string[];
  /** Network name if VPC-bound */
  network?: string;
}

export interface GeneratedOutput {
  /** Relative path within output (e.g., 'templates/deployment.yaml') */
  path: string;
  /** File content */
  content: string;
}

// Plugin service types (for plugins that provide runnable services)
export interface PluginService {
  /** Service name (e.g., 'kernel') */
  name: string;
  /** Docker image reference (e.g., 'ghcr.io/monkeybarrels/stacksolo-kernel:0.1.0') */
  image: string;
  /** Relative path to service source for local dev builds */
  sourcePath?: string;
  /** Ports exposed by the service */
  ports: Record<string, number>;
  /** Environment variables the service expects */
  env?: Record<string, string>;
  /** K8s resource requirements */
  resources?: {
    cpu?: string;
    memory?: string;
  };
}

// Plugin types
export interface Plugin {
  /** Plugin name (e.g., '@stacksolo/plugin-kernel') */
  name?: string;
  /** Plugin version */
  version?: string;
  providers?: Provider[];
  resources?: ResourceType[];
  patterns?: AppPattern[];
  /** Services this plugin provides (e.g., kernel container) */
  services?: PluginService[];
  /** Output formatters this plugin provides (e.g., helm, kustomize) */
  outputFormatters?: OutputFormatter[];
}

// Define helper input types
export interface DefineProviderInput {
  id: string;
  name: string;
  icon: string;
  auth: AuthMethod;
  resources: ResourceType[];
}

export interface DefineResourceInput {
  id: string;
  provider: string;
  name: string;
  description: string;
  icon: string;
  configSchema: JSONSchema;
  defaultConfig: Record<string, unknown>;
  generate: (config: ResourceConfig) => GeneratedCode;
  estimateCost?: (config: ResourceConfig) => CostEstimate;
}
