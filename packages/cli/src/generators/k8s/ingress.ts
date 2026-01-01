/**
 * Ingress manifest generator
 * Creates K8s Ingress from loadBalancer.routes config
 */

import type { K8sIngress, K8sIngressPath, GeneratedManifest } from './types';
import { generateYamlDocument } from './yaml';
import { sanitizeNamespaceName } from './namespace';

export interface RouteConfig {
  path: string;
  backend: string;
}

export interface IngressOptions {
  projectName: string;
  routes: RouteConfig[];
  servicePortMap: Record<string, number>;
}

/**
 * Generate Ingress manifest from routes config
 */
export function generateIngress(options: IngressOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);

  const labels = {
    'app.kubernetes.io/name': 'stacksolo-ingress',
    'app.kubernetes.io/component': 'ingress',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  // Convert routes to K8s Ingress paths
  // Sort routes: more specific paths first, catch-all last
  const sortedRoutes = [...options.routes].sort((a, b) => {
    // Catch-all routes go last
    if (a.path === '/*' || a.path === '/') return 1;
    if (b.path === '/*' || b.path === '/') return -1;
    // More specific (longer) paths first
    return b.path.length - a.path.length;
  });

  const paths: K8sIngressPath[] = sortedRoutes.map((route) => {
    const serviceName = sanitizeName(route.backend);
    const servicePort = options.servicePortMap[route.backend] || 8080;

    return {
      path: convertPathToIngress(route.path),
      pathType: 'ImplementationSpecific',
      backend: {
        service: {
          name: serviceName,
          port: {
            number: servicePort,
          },
        },
      },
    };
  });

  const ingress: K8sIngress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'stacksolo-ingress',
      namespace,
      labels,
      annotations: {
        'nginx.ingress.kubernetes.io/rewrite-target': '/$2',
        'nginx.ingress.kubernetes.io/use-regex': 'true',
      },
    },
    spec: {
      ingressClassName: 'nginx',
      rules: [
        {
          http: {
            paths,
          },
        },
      ],
    },
  };

  // Build route table for documentation
  const routeTable = sortedRoutes
    .map((r) => `  ${r.path.padEnd(15)} → ${r.backend}`)
    .join('\n');

  const content = generateYamlDocument(
    ingress as unknown as Record<string, unknown>,
    `StackSolo Ingress\nRoutes:\n${routeTable}`
  );

  return {
    filename: 'ingress.yaml',
    content,
  };
}

/**
 * Convert config path pattern to nginx ingress regex pattern
 * Examples:
 *   /api/*  → /api(/|$)(.*)
 *   /hello/* → /hello(/|$)(.*)
 *   /* → /(.*)
 */
function convertPathToIngress(path: string): string {
  // Handle catch-all
  if (path === '/*' || path === '/') {
    return '/(.*)';
  }

  // Remove trailing /* or *
  const basePath = path.replace(/\/?\*$/, '');

  // Create regex pattern that captures the rest of the path
  return `${basePath}(/|$)(.*)`;
}

/**
 * Sanitize name for K8s resource naming
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '')
    .slice(0, 63);
}
