/**
 * Helm Plugin Types
 */

export interface HelmChartConfig {
  /** Chart version (default: 0.1.0) */
  chartVersion?: string;
  /** App version (default: latest) */
  appVersion?: string;
  /** Override default values */
  values?: Record<string, unknown>;
}

export interface HelmValues {
  /** Default replica count */
  replicaCount: number;
  /** Image configuration */
  image: {
    pullPolicy: string;
  };
  /** Resource limits/requests */
  resources: {
    limits: {
      cpu: string;
      memory: string;
    };
    requests: {
      cpu: string;
      memory: string;
    };
  };
  /** Ingress configuration */
  ingress: {
    enabled: boolean;
    className: string;
    host?: string;
    tlsSecretName?: string;
    annotations: Record<string, string>;
    routes: Array<{
      path: string;
      backend: string;
      port: number;
    }>;
  };
  /** Base config map data */
  config: Record<string, string>;
  /** Per-deployment configuration */
  deployments: Record<string, DeploymentValues>;
}

export interface DeploymentValues {
  /** Whether this deployment is enabled */
  enabled: boolean;
  /** Override replica count */
  replicaCount?: number;
  /** Image configuration */
  image: {
    repository: string;
    tag: string;
  };
  /** Container port */
  port: number;
  /** Service port (defaults to 80) */
  servicePort?: number;
  /** Environment variables */
  env: Record<string, string>;
  /** Override resources */
  resources?: {
    limits?: {
      cpu?: string;
      memory?: string;
    };
    requests?: {
      cpu?: string;
      memory?: string;
    };
  };
}
