import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

interface RouteConfig {
  path: string;
  functionName?: string;    // For Cloud Function backend
  containerName?: string;   // For Cloud Run backend
  uiName?: string;          // For Storage bucket backend (static UI)
  iapEnabled?: boolean;     // Enable IAP on this route's backend
}

interface IapConfig {
  backend: string;          // Backend service name to protect
  allowedMembers: string[]; // IAM members allowed access
}

export const loadBalancer = defineResource({
  id: 'gcp-cdktf:load_balancer',
  provider: 'gcp-cdktf',
  name: 'HTTP/HTTPS Load Balancer',
  description: 'Global HTTP/HTTPS load balancer with optional SSL and IAP support',
  icon: 'dns',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Load Balancer Name',
        description: 'Unique name for the load balancer',
        minLength: 1,
        maxLength: 63,
      },
      region: {
        type: 'string',
        title: 'Region',
        description: 'Region for the serverless NEG',
      },
      functionName: {
        type: 'string',
        title: 'Function Name',
        description: 'Default Cloud Function to route traffic to',
      },
      routes: {
        type: 'array',
        title: 'Routes',
        description: 'Path-based routing rules (array of {path, functionName})',
        items: {
          type: 'object',
        },
      },
      domain: {
        type: 'string',
        title: 'Domain',
        description: 'Custom domain for HTTPS (requires DNS to point to load balancer IP)',
      },
      enableHttps: {
        type: 'boolean',
        title: 'Enable HTTPS',
        description: 'Enable HTTPS with managed SSL certificate (requires domain)',
      },
      redirectHttpToHttps: {
        type: 'boolean',
        title: 'Redirect HTTP to HTTPS',
        description: 'Redirect all HTTP traffic to HTTPS',
      },
      iap: {
        type: 'array',
        title: 'IAP Configuration',
        description: 'Identity-Aware Proxy settings per backend',
        items: {
          type: 'object',
        },
      },
    },
    required: ['name', 'region'],
  },

  defaultConfig: {},

  generate: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const lbConfig = config as {
      name: string;
      region: string;
      functionName?: string;
      routes?: RouteConfig[];
      domain?: string;
      enableHttps?: boolean;
      redirectHttpToHttps?: boolean;
      iap?: IapConfig[];
    };

    // Get routes (or use default function if specified)
    const routes = lbConfig.routes || (lbConfig.functionName ? [{ path: '/*', functionName: lbConfig.functionName }] : []);

    // Separate function, container, and UI backends
    const functionRoutes = routes.filter(r => r.functionName);
    const containerRoutes = routes.filter(r => r.containerName);
    const uiRoutes = routes.filter(r => r.uiName);
    const uniqueFunctions = [...new Set(functionRoutes.map(r => r.functionName!))];
    const uniqueContainers = [...new Set(containerRoutes.map(r => r.containerName!))];
    const uniqueUIs = [...new Set(uiRoutes.map(r => r.uiName!))];

    // Generate NEG and Backend for each unique function
    const functionNegBackendCode = uniqueFunctions.map(fnName => {
      const fnVar = toVariableName(fnName);
      return `// Serverless NEG for Cloud Function ${fnName}
const ${fnVar}Neg = new ComputeRegionNetworkEndpointGroup(this, '${fnName}-neg', {
  name: '${fnName}-neg',
  region: '${lbConfig.region}',
  networkEndpointType: 'SERVERLESS',
  cloudFunction: {
    function: ${fnVar}Function.name,
  },
});

// Backend service for ${fnName}
// Note: timeoutSec and portName are not supported for serverless NEG backend services
const ${fnVar}Backend = new ComputeBackendService(this, '${fnName}-backend', {
  name: '${lbConfig.name}-${fnName}-backend',
  protocol: 'HTTP',
  backend: [{
    group: ${fnVar}Neg.selfLink,
  }],
});`;
    }).join('\n\n');

    // Generate NEG and Backend for each unique Cloud Run container
    const containerNegBackendCode = uniqueContainers.map(containerName => {
      const containerVar = toVariableName(containerName);
      return `// Serverless NEG for Cloud Run ${containerName}
const ${containerVar}Neg = new ComputeRegionNetworkEndpointGroup(this, '${containerName}-neg', {
  name: '${containerName}-neg',
  region: '${lbConfig.region}',
  networkEndpointType: 'SERVERLESS',
  cloudRun: {
    service: ${containerVar}Service.name,
  },
});

// Backend service for ${containerName}
// Note: timeoutSec is not supported for serverless NEG backend services
const ${containerVar}Backend = new ComputeBackendService(this, '${containerName}-backend', {
  name: '${lbConfig.name}-${containerName}-backend',
  protocol: 'HTTP',
  backend: [{
    group: ${containerVar}Neg.selfLink,
  }],
});`;
    }).join('\n\n');

    const negBackendCode = [functionNegBackendCode, containerNegBackendCode].filter(Boolean).join('\n\n');

    // Note: UI backend buckets are created by storage-website resource
    // We just reference them here by their variable name pattern: ${uiVar}BackendBucket

    // Helper to get backend reference for a route
    const getBackendRef = (route: RouteConfig): string => {
      if (route.functionName) {
        return `${toVariableName(route.functionName)}Backend.selfLink`;
      } else if (route.containerName) {
        return `${toVariableName(route.containerName)}Backend.selfLink`;
      } else if (route.uiName) {
        return `${toVariableName(route.uiName)}BackendBucket.selfLink`;
      }
      return '';
    };

    // Find the default route (/*)
    const defaultRoute = routes.find(r => r.path === '/*');
    let defaultBackendRef: string;
    if (defaultRoute) {
      defaultBackendRef = getBackendRef(defaultRoute);
    } else if (uniqueContainers.length > 0) {
      defaultBackendRef = `${toVariableName(uniqueContainers[0])}Backend.selfLink`;
    } else if (uniqueFunctions.length > 0) {
      defaultBackendRef = `${toVariableName(uniqueFunctions[0])}Backend.selfLink`;
    } else if (uniqueUIs.length > 0) {
      defaultBackendRef = `${toVariableName(uniqueUIs[0])}BackendBucket.selfLink`;
    } else {
      defaultBackendRef = '';
    }

    // Generate path matchers for non-default routes
    const nonDefaultRoutes = routes.filter(r => r.path !== '/*');

    let urlMapConfig: string;
    if (nonDefaultRoutes.length === 0) {
      // Simple case: just one default route
      urlMapConfig = `// URL Map (Load Balancer routing)
const ${varName}UrlMap = new ComputeUrlMap(this, '${config.name}-urlmap', {
  name: '${config.name}',
  defaultService: ${defaultBackendRef},
});`;
    } else {
      // Complex case: path-based routing
      // GCP URL maps require ONE path_matcher per host_rule, with all path rules inside
      const pathRulesCode = nonDefaultRoutes.map((route) => {
        const backendRef = getBackendRef(route);
        // For paths like /admin/*, also include /admin (without trailing slash)
        // to ensure both /admin and /admin/* are routed correctly
        const paths = [route.path];
        if (route.path.endsWith('/*')) {
          const basePath = route.path.slice(0, -2); // Remove /*
          if (basePath) {
            paths.unshift(basePath); // Add base path first
          }
        }
        const pathsStr = paths.map(p => `'${p}'`).join(', ');
        return `      {
        paths: [${pathsStr}],
        service: ${backendRef},
      }`;
      }).join(',\n');

      urlMapConfig = `// URL Map with path-based routing
const ${varName}UrlMap = new ComputeUrlMap(this, '${config.name}-urlmap', {
  name: '${config.name}',
  defaultService: ${defaultBackendRef},
  hostRule: [{
    hosts: ['*'],
    pathMatcher: 'all-paths',
  }],
  pathMatcher: [{
    name: 'all-paths',
    defaultService: ${defaultBackendRef},
    pathRule: [
${pathRulesCode},
    ],
  }],
});`;
    }

    // Determine if HTTPS should be enabled
    const enableHttps = lbConfig.enableHttps && lbConfig.domain;
    const redirectHttpToHttps = lbConfig.redirectHttpToHttps && enableHttps;

    // Generate IAP configuration code if specified
    const iapConfigs = lbConfig.iap || [];
    const iapCode = iapConfigs.length > 0 ? `
// =============================================================================
// Identity-Aware Proxy (IAP) Configuration
// =============================================================================

// Enable IAP API
const iapApi = new ProjectService(this, '${config.name}-iap-api', {
  service: 'iap.googleapis.com',
  disableOnDestroy: false,
});
` : '';

    // Generate HTTPS resources if enabled
    let httpsCode = '';
    let httpRedirectCode = '';
    const imports = [
      "import { ComputeGlobalAddress } from '@cdktf/provider-google/lib/compute-global-address';",
      "import { ComputeGlobalForwardingRule } from '@cdktf/provider-google/lib/compute-global-forwarding-rule';",
      "import { ComputeTargetHttpProxy } from '@cdktf/provider-google/lib/compute-target-http-proxy';",
      "import { ComputeUrlMap } from '@cdktf/provider-google/lib/compute-url-map';",
      "import { ComputeBackendService } from '@cdktf/provider-google/lib/compute-backend-service';",
      "import { ComputeRegionNetworkEndpointGroup } from '@cdktf/provider-google/lib/compute-region-network-endpoint-group';",
    ];

    if (enableHttps) {
      imports.push(
        "import { ComputeManagedSslCertificate } from '@cdktf/provider-google/lib/compute-managed-ssl-certificate';",
        "import { ComputeTargetHttpsProxy } from '@cdktf/provider-google/lib/compute-target-https-proxy';",
      );

      httpsCode = `
// =============================================================================
// HTTPS Configuration with Managed SSL Certificate
// =============================================================================

// Managed SSL Certificate (auto-provisioned by Google)
const ${varName}SslCert = new ComputeManagedSslCertificate(this, '${config.name}-ssl-cert', {
  name: '${config.name}-ssl-cert',
  managed: {
    domains: ['${lbConfig.domain}'],
  },
});

// HTTPS Proxy
const ${varName}HttpsProxy = new ComputeTargetHttpsProxy(this, '${config.name}-https-proxy', {
  name: '${config.name}-https-proxy',
  urlMap: ${varName}UrlMap.selfLink,
  sslCertificates: [${varName}SslCert.selfLink],
});

// HTTPS Forwarding Rule (port 443)
new ComputeGlobalForwardingRule(this, '${config.name}-https-rule', {
  name: '${config.name}-https-rule',
  target: ${varName}HttpsProxy.selfLink,
  portRange: '443',
  ipAddress: ${varName}Ip.address,
});`;
    }

    if (redirectHttpToHttps) {
      // Create HTTP to HTTPS redirect
      httpRedirectCode = `
// =============================================================================
// HTTP to HTTPS Redirect
// =============================================================================

// URL Map for HTTP to HTTPS redirect
const ${varName}RedirectUrlMap = new ComputeUrlMap(this, '${config.name}-redirect-urlmap', {
  name: '${config.name}-redirect',
  defaultUrlRedirect: {
    httpsRedirect: true,
    stripQuery: false,
    redirectResponseCode: 'MOVED_PERMANENTLY_DEFAULT',
  },
});

// HTTP Proxy (for redirect only)
const ${varName}HttpProxy = new ComputeTargetHttpProxy(this, '${config.name}-http-proxy', {
  name: '${config.name}-http-proxy',
  urlMap: ${varName}RedirectUrlMap.selfLink,
});

// HTTP Forwarding Rule (redirects to HTTPS)
new ComputeGlobalForwardingRule(this, '${config.name}-http-rule', {
  name: '${config.name}-http-rule',
  target: ${varName}HttpProxy.selfLink,
  portRange: '80',
  ipAddress: ${varName}Ip.address,
});`;
    }

    // Standard HTTP-only forwarding (when not redirecting)
    const httpOnlyCode = !redirectHttpToHttps ? `
// HTTP Proxy
const ${varName}HttpProxy = new ComputeTargetHttpProxy(this, '${config.name}-http-proxy', {
  name: '${config.name}-http-proxy',
  urlMap: ${varName}UrlMap.selfLink,
});

// Forwarding Rule (routes traffic to HTTP proxy)
new ComputeGlobalForwardingRule(this, '${config.name}-http-rule', {
  name: '${config.name}-http-rule',
  target: ${varName}HttpProxy.selfLink,
  portRange: '80',
  ipAddress: ${varName}Ip.address,
});` : '';

    // Add IAP imports if needed
    if (iapConfigs.length > 0) {
      imports.push(
        "import { ProjectService } from '@cdktf/provider-google/lib/project-service';",
      );
    }

    const code = `${iapCode}${negBackendCode}

${urlMapConfig}

// Global IP Address
const ${varName}Ip = new ComputeGlobalAddress(this, '${config.name}-ip', {
  name: '${config.name}-ip',
});
${httpsCode}${httpRedirectCode}${httpOnlyCode}`;

    // Build outputs
    const outputs = [
      `export const ${varName}LoadBalancerIp = ${varName}Ip.address;`,
    ];

    if (enableHttps && lbConfig.domain) {
      outputs.push(
        `// HTTPS URL: https://${lbConfig.domain}`,
        `// Note: SSL certificate provisioning may take 15-60 minutes`,
        `// DNS must point ${lbConfig.domain} to the load balancer IP`,
      );
    }

    if (iapConfigs.length > 0) {
      outputs.push(
        `// IAP is configured for backends: ${iapConfigs.map(c => c.backend).join(', ')}`,
        `// Enable IAP on each backend: gcloud compute backend-services update <backend-name> --global --iap=enabled`,
      );
    }

    return {
      imports,
      code,
      outputs,
    };
  },

  estimateCost: () => ({
    monthly: 18,
    currency: 'USD',
    breakdown: [
      { item: 'Forwarding rule', amount: 0 },
      { item: 'Data processing ($0.008/GB)', amount: 8 },
      { item: 'Backend service', amount: 10 },
    ],
  }),
});
