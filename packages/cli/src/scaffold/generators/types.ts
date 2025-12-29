/**
 * Types for scaffold generators
 */

export interface EnvVariable {
  name: string;
  value: string;
  comment?: string;
  isSecret?: boolean;
}

export interface EnvSection {
  header: string;
  variables: EnvVariable[];
}

export interface DockerService {
  name: string;
  image: string;
  environment?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  command?: string[];
  depends_on?: string[];
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
  };
}

export interface DockerComposeConfig {
  version: string;
  services: Record<string, DockerService>;
  volumes?: Record<string, { driver?: string }>;
  networks?: Record<string, { driver?: string }>;
}

export interface ServiceScaffold {
  name: string;
  type: 'container' | 'function';
  files: GeneratedFile[];
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface ScaffoldResult {
  files: GeneratedFile[];
  warnings: string[];
  summary: {
    envVars: number;
    dockerServices: number;
    serviceDirectories: number;
  };
}

export interface ScaffoldOptions {
  targetDir: string;
  force: boolean;
  envOnly?: boolean;
  dockerOnly?: boolean;
  servicesOnly?: boolean;
}
