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
  generatePulumi: (config: ResourceConfig) => PulumiCode;
  estimateCost?: (config: ResourceConfig) => CostEstimate;
}

export interface ResourceConfig {
  name: string;
  [key: string]: unknown;
}

export interface PulumiCode {
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

// Plugin types
export interface Plugin {
  providers?: Provider[];
  resources?: ResourceType[];
  patterns?: AppPattern[];
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
  generatePulumi: (config: ResourceConfig) => PulumiCode;
  estimateCost?: (config: ResourceConfig) => CostEstimate;
}
