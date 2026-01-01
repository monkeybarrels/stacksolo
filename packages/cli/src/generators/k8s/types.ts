/**
 * Types for Kubernetes manifest generation
 * Used by stacksolo dev to create local K8s environment
 */

// ============================================================================
// K8s Resource Types
// ============================================================================

export interface K8sMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface K8sNamespace {
  apiVersion: 'v1';
  kind: 'Namespace';
  metadata: K8sMetadata;
}

export interface K8sConfigMap {
  apiVersion: 'v1';
  kind: 'ConfigMap';
  metadata: K8sMetadata;
  data: Record<string, string>;
}

export interface K8sContainerPort {
  containerPort: number;
  name?: string;
  protocol?: 'TCP' | 'UDP';
}

export interface K8sEnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    configMapKeyRef?: {
      name: string;
      key: string;
    };
  };
}

export interface K8sVolumeMount {
  name: string;
  mountPath: string;
  subPath?: string;
  readOnly?: boolean;
}

export interface K8sResourceRequirements {
  limits?: {
    cpu?: string;
    memory?: string;
  };
  requests?: {
    cpu?: string;
    memory?: string;
  };
}

export interface K8sContainer {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  ports?: K8sContainerPort[];
  env?: K8sEnvVar[];
  envFrom?: Array<{
    configMapRef?: { name: string };
  }>;
  volumeMounts?: K8sVolumeMount[];
  workingDir?: string;
  resources?: K8sResourceRequirements;
}

export interface K8sHostPathVolume {
  hostPath: {
    path: string;
    type?: 'Directory' | 'DirectoryOrCreate';
  };
}

export interface K8sVolume {
  name: string;
  hostPath?: K8sHostPathVolume['hostPath'];
  emptyDir?: Record<string, never>;
  configMap?: {
    name: string;
  };
}

export interface K8sPodSpec {
  containers: K8sContainer[];
  volumes?: K8sVolume[];
  restartPolicy?: 'Always' | 'OnFailure' | 'Never';
}

export interface K8sDeployment {
  apiVersion: 'apps/v1';
  kind: 'Deployment';
  metadata: K8sMetadata;
  spec: {
    replicas: number;
    selector: {
      matchLabels: Record<string, string>;
    };
    template: {
      metadata: {
        labels: Record<string, string>;
      };
      spec: K8sPodSpec;
    };
  };
}

export interface K8sServicePort {
  port: number;
  targetPort: number;
  name?: string;
  protocol?: 'TCP' | 'UDP';
}

export interface K8sService {
  apiVersion: 'v1';
  kind: 'Service';
  metadata: K8sMetadata;
  spec: {
    selector: Record<string, string>;
    ports: K8sServicePort[];
    type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  };
}

export interface K8sIngressPath {
  path: string;
  pathType: 'Prefix' | 'Exact' | 'ImplementationSpecific';
  backend: {
    service: {
      name: string;
      port: {
        number: number;
      };
    };
  };
}

export interface K8sIngress {
  apiVersion: 'networking.k8s.io/v1';
  kind: 'Ingress';
  metadata: K8sMetadata;
  spec: {
    ingressClassName?: string;
    rules: Array<{
      host?: string;
      http: {
        paths: K8sIngressPath[];
      };
    }>;
  };
}

// ============================================================================
// Generator Types
// ============================================================================

export interface GeneratedManifest {
  filename: string;
  content: string;
}

export interface K8sGeneratorResult {
  manifests: GeneratedManifest[];
  services: string[];
  warnings: string[];
}

// ============================================================================
// Runtime & Framework Types
// ============================================================================

export type NodeRuntime = 'nodejs18' | 'nodejs20';
export type PythonRuntime = 'python39' | 'python310' | 'python311' | 'python312';
export type Runtime = NodeRuntime | PythonRuntime;

export type UIFramework = 'vue' | 'nuxt' | 'react' | 'next' | 'svelte' | 'sveltekit';

export interface RuntimeConfig {
  image: string;
  command: string[];
}

export interface FrameworkConfig {
  command: string[];
}

// ============================================================================
// Port Assignment
// ============================================================================

export interface PortAssignment {
  ingress: number;
  firestoreEmulator: number;
  authEmulator: number;
  pubsubEmulator: number;
  functionBasePort: number;
  uiBasePort: number;
}

export const DEFAULT_PORTS: PortAssignment = {
  ingress: 8000,
  firestoreEmulator: 8080,
  authEmulator: 9099,
  pubsubEmulator: 8085,
  functionBasePort: 8081,
  uiBasePort: 3000,
};
