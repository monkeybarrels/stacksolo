/**
 * Gateway manifest generator
 * Creates an nginx reverse proxy pod for path-based routing
 * Scoped to the project namespace for easy cleanup
 */

import type { K8sDeployment, K8sService, K8sConfigMap, GeneratedManifest } from './types';
import { generateYamlDocument, combineYamlDocuments } from './yaml';
import { sanitizeNamespaceName } from './namespace';

export interface RouteConfig {
  path: string;
  backend: string;
}

export interface GatewayOptions {
  projectName: string;
  routes: RouteConfig[];
  servicePortMap: Record<string, number>;
}

/**
 * Generate Gateway (nginx reverse proxy) manifest
 */
export function generateGateway(options: GatewayOptions): GeneratedManifest {
  const namespace = sanitizeNamespaceName(options.projectName);

  const labels = {
    'app.kubernetes.io/name': 'gateway',
    'app.kubernetes.io/component': 'gateway',
    'app.kubernetes.io/managed-by': 'stacksolo',
    'stacksolo.dev/project': options.projectName,
  };

  // Sort routes: more specific paths first, catch-all last
  const sortedRoutes = [...options.routes].sort((a, b) => {
    if (a.path === '/*' || a.path === '/') return 1;
    if (b.path === '/*' || b.path === '/') return -1;
    return b.path.length - a.path.length;
  });

  // Generate nginx config
  const nginxConfig = generateNginxConfig(sortedRoutes, options.servicePortMap);

  // ConfigMap for nginx config
  const configMap: K8sConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'gateway-config',
      namespace,
      labels,
    },
    data: {
      'nginx.conf': nginxConfig,
    },
  };

  // Deployment
  const deployment: K8sDeployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'gateway',
      namespace,
      labels,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          'app.kubernetes.io/name': 'gateway',
        },
      },
      template: {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'gateway',
            'app.kubernetes.io/component': 'gateway',
          },
        },
        spec: {
          containers: [
            {
              name: 'nginx',
              image: 'nginx:alpine',
              ports: [
                {
                  containerPort: 8000,
                  name: 'http',
                },
              ],
              volumeMounts: [
                {
                  name: 'config',
                  mountPath: '/etc/nginx/nginx.conf',
                  subPath: 'nginx.conf',
                },
              ],
              resources: {
                limits: {
                  memory: '64Mi',
                },
                requests: {
                  memory: '32Mi',
                },
              },
            },
          ],
          volumes: [
            {
              name: 'config',
              configMap: {
                name: 'gateway-config',
              },
            },
          ],
        },
      },
    },
  };

  // Service
  const service: K8sService = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'gateway',
      namespace,
      labels,
    },
    spec: {
      selector: {
        'app.kubernetes.io/name': 'gateway',
      },
      ports: [
        {
          port: 8000,
          targetPort: 8000,
          name: 'http',
        },
      ],
      type: 'ClusterIP',
    },
  };

  // Build route table for documentation
  const routeTable = sortedRoutes
    .map((r) => `  ${r.path.padEnd(15)} → ${r.backend}`)
    .join('\n');

  const configMapYaml = generateYamlDocument(
    configMap as unknown as Record<string, unknown>,
    'Gateway nginx configuration'
  );

  const deploymentYaml = generateYamlDocument(
    deployment as unknown as Record<string, unknown>,
    `Gateway (Load Balancer)\nRoutes:\n${routeTable}`
  );

  const serviceYaml = generateYamlDocument(
    service as unknown as Record<string, unknown>
  );

  const content = combineYamlDocuments([configMapYaml, deploymentYaml, serviceYaml]);

  return {
    filename: 'gateway.yaml',
    content,
  };
}

/**
 * Generate nginx.conf for reverse proxy routing
 */
function generateNginxConfig(
  routes: RouteConfig[],
  servicePortMap: Record<string, number>
): string {
  const locations = routes.map((route) => {
    const serviceName = sanitizeName(route.backend);
    const servicePort = servicePortMap[route.backend] || 8080;
    const upstream = `http://${serviceName}:${servicePort}`;

    // Convert path pattern to nginx location
    if (route.path === '/*' || route.path === '/') {
      return `
        location / {
            proxy_pass ${upstream};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }`;
    }

    // Strip trailing /* for location matching
    const basePath = route.path.replace(/\/?\*$/, '');

    // Preserve the path prefix when proxying (don't strip it)
    // This means /api/health proxies to backend as /api/health
    return `
        location ${basePath}/ {
            proxy_pass ${upstream};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }`;
  });

  return `
events {
    worker_connections 1024;
}

http {
    keepalive_timeout 60s;
    proxy_connect_timeout 60s;
    proxy_read_timeout 60s;

    server {
        listen 8000;
        server_name _;

        # Health check endpoint
        location /healthz {
            return 200 'ok';
            add_header Content-Type text/plain;
        }
${locations.join('\n')}
    }
}
`;
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
