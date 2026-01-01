import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

interface RouteConfig {
  path: string;
  functionName?: string;    // For Cloud Function backend
  containerName?: string;   // For Cloud Run backend
  uiName?: string;          // For Storage bucket backend (static UI)
}

export const loadBalancer = defineResource({
  id: 'gcp-cdktf:load_balancer',
  provider: 'gcp-cdktf',
  name: 'HTTP Load Balancer',
  description: 'Global HTTP load balancer for Cloud Functions (serverless NEG)',
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
const ${fnVar}Backend = new ComputeBackendService(this, '${fnName}-backend', {
  name: '${fnName}-backend',
  protocol: 'HTTP',
  portName: 'http',
  timeoutSec: 30,
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
const ${containerVar}Backend = new ComputeBackendService(this, '${containerName}-backend', {
  name: '${containerName}-backend',
  protocol: 'HTTP',
  portName: 'http',
  timeoutSec: 300,
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
        return `      {
        paths: ['${route.path}'],
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

    const code = `${negBackendCode}

${urlMapConfig}

// HTTP Proxy
const ${varName}HttpProxy = new ComputeTargetHttpProxy(this, '${config.name}-http-proxy', {
  name: '${config.name}-http-proxy',
  urlMap: ${varName}UrlMap.selfLink,
});

// Global IP Address
const ${varName}Ip = new ComputeGlobalAddress(this, '${config.name}-ip', {
  name: '${config.name}-ip',
});

// Forwarding Rule (routes traffic to HTTP proxy)
new ComputeGlobalForwardingRule(this, '${config.name}-http-rule', {
  name: '${config.name}-http-rule',
  target: ${varName}HttpProxy.selfLink,
  portRange: '80',
  ipAddress: ${varName}Ip.address,
});`;

    return {
      imports: [
        "import { ComputeGlobalAddress } from '@cdktf/provider-google/lib/compute-global-address';",
        "import { ComputeGlobalForwardingRule } from '@cdktf/provider-google/lib/compute-global-forwarding-rule';",
        "import { ComputeTargetHttpProxy } from '@cdktf/provider-google/lib/compute-target-http-proxy';",
        "import { ComputeUrlMap } from '@cdktf/provider-google/lib/compute-url-map';",
        "import { ComputeBackendService } from '@cdktf/provider-google/lib/compute-backend-service';",
        "import { ComputeRegionNetworkEndpointGroup } from '@cdktf/provider-google/lib/compute-region-network-endpoint-group';",
      ],
      code,
      outputs: [
        `export const ${varName}LoadBalancerIp = ${varName}Ip.address;`,
      ],
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
