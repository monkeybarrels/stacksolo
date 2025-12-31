import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

interface RouteConfig {
  path: string;
  functionName: string;
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
    required: ['name', 'region', 'functionName'],
  },

  defaultConfig: {},

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const lbConfig = config as {
      name: string;
      region: string;
      functionName: string;
      routes?: RouteConfig[];
    };

    // Get unique functions from routes (or just use default)
    const routes = lbConfig.routes || [{ path: '/*', functionName: lbConfig.functionName }];
    const uniqueFunctions = [...new Set(routes.map(r => r.functionName))];

    // Generate NEG and Backend for each unique function
    const negBackendCode = uniqueFunctions.map(fnName => {
      const fnVar = toVariableName(fnName);
      return `// Serverless NEG for ${fnName}
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

    // Find the default route (/*) or use first function
    const defaultRoute = routes.find(r => r.path === '/*');
    const defaultFnVar = toVariableName(defaultRoute?.functionName || uniqueFunctions[0]);

    // Generate path matchers for non-default routes
    const nonDefaultRoutes = routes.filter(r => r.path !== '/*');

    let urlMapConfig: string;
    if (nonDefaultRoutes.length === 0) {
      // Simple case: just one default route
      urlMapConfig = `// URL Map (Load Balancer routing)
const ${varName}UrlMap = new ComputeUrlMap(this, '${config.name}-urlmap', {
  name: '${config.name}',
  defaultService: ${defaultFnVar}Backend.selfLink,
});`;
    } else {
      // Complex case: path-based routing with host rules and path matchers
      const pathMatcherNames: string[] = [];
      const pathMatchersCode = nonDefaultRoutes.map((route, idx) => {
        const fnVar = toVariableName(route.functionName);
        const matcherName = `path-matcher-${idx}`;
        pathMatcherNames.push(matcherName);
        return `    {
      name: '${matcherName}',
      defaultService: ${fnVar}Backend.selfLink,
      pathRule: [{
        paths: ['${route.path}'],
        service: ${fnVar}Backend.selfLink,
      }],
    }`;
      }).join(',\n');

      urlMapConfig = `// URL Map with path-based routing
const ${varName}UrlMap = new ComputeUrlMap(this, '${config.name}-urlmap', {
  name: '${config.name}',
  defaultService: ${defaultFnVar}Backend.selfLink,
  hostRule: [{
    hosts: ['*'],
    pathMatcher: 'path-matcher-0',
  }],
  pathMatcher: [
${pathMatchersCode},
    {
      name: 'default-matcher',
      defaultService: ${defaultFnVar}Backend.selfLink,
    },
  ],
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
