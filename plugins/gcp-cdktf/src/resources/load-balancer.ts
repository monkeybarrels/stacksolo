import { defineResource, type ResourceConfig } from '@stacksolo/core';
import { generateLabelsCode, RESOURCE_TYPES } from '../utils/labels';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

interface RouteConfig {
  host?: string;            // For host-based routing (e.g., "api.example.com")
  path: string;
  functionName?: string;    // For Cloud Function backend
  containerName?: string;   // For Cloud Run backend
  uiName?: string;          // For Storage bucket backend (static UI)
  iapEnabled?: boolean;     // Enable IAP on this route's backend
  iapConfigName?: string;   // Name of the IAP config (for OAuth client reference)
}

interface IapConfig {
  backend: string;          // Backend service name to protect
  allowedMembers: string[]; // IAM members allowed access
}

interface IapWebBackendConfig {
  name: string;             // IAP config name (matches zero-trust:iap_web_backend)
  backend: string;          // Backend service name to protect
}

interface DnsConfig {
  provider: 'cloudflare';   // DNS provider
  zoneId?: string;          // Cloudflare zone ID (can also be at project level)
  proxied?: boolean;        // Enable Cloudflare proxy (default: true)
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
      dns: {
        type: 'object',
        title: 'DNS Configuration',
        description: 'Automatic DNS record creation (requires Cloudflare plugin)',
        properties: {
          provider: {
            type: 'string',
            enum: ['cloudflare'],
            description: 'DNS provider',
          },
          zoneId: {
            type: 'string',
            description: 'Cloudflare zone ID (optional if set at project level)',
          },
          proxied: {
            type: 'boolean',
            description: 'Enable Cloudflare proxy (default: true)',
          },
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
      domains?: string[];        // Multiple domains for single SSL cert
      enableHttps?: boolean;
      redirectHttpToHttps?: boolean;
      iap?: IapConfig[];
      iapWebBackends?: IapWebBackendConfig[];
      dns?: DnsConfig;
      cloudflareZoneId?: string;  // Can be passed from project-level config
      projectName?: string;
    };

    // Normalize domains - use domains array if provided, otherwise use domain
    const allDomains = lbConfig.domains || (lbConfig.domain ? [lbConfig.domain] : []);

    const projectName = lbConfig.projectName || '${var.project_name}';
    const labelsCode = generateLabelsCode(projectName, RESOURCE_TYPES.LOAD_BALANCER);

    // Get routes (or use default function if specified)
    const routes = lbConfig.routes || (lbConfig.functionName ? [{ path: '/*', functionName: lbConfig.functionName }] : []);

    // Separate function, container, and UI backends
    const functionRoutes = routes.filter(r => r.functionName);
    const containerRoutes = routes.filter(r => r.containerName);
    const uiRoutes = routes.filter(r => r.uiName);
    const uniqueFunctions = [...new Set(functionRoutes.map(r => r.functionName!))];
    const uniqueContainers = [...new Set(containerRoutes.map(r => r.containerName!))];
    const uniqueUIs = [...new Set(uiRoutes.map(r => r.uiName!))];

    // Build a map of backends that have IAP enabled
    const iapWebBackendMap = new Map<string, IapWebBackendConfig>();
    for (const iapWb of lbConfig.iapWebBackends || []) {
      iapWebBackendMap.set(iapWb.backend, iapWb);
    }
    // Also check routes for iapEnabled flag
    for (const route of routes) {
      if (route.iapEnabled && route.iapConfigName) {
        const backend = route.functionName || route.containerName;
        if (backend && !iapWebBackendMap.has(backend)) {
          iapWebBackendMap.set(backend, { name: route.iapConfigName, backend });
        }
      }
    }

    // Generate NEG and Backend for each unique function
    const functionNegBackendCode = uniqueFunctions.map(fnName => {
      const fnVar = toVariableName(fnName);
      const iapConfig = iapWebBackendMap.get(fnName);
      const iapVarName = iapConfig ? toVariableName(iapConfig.name) : null;

      // Generate IAP block if this backend has IAP enabled
      const iapBlock = iapConfig ? `
  iap: {
    enabled: true,
    oauth2ClientId: ${iapVarName}Client.clientId,
    oauth2ClientSecret: ${iapVarName}Client.secret,
  },` : '';

      return `// Serverless NEG for Cloud Function ${fnName}
const ${fnVar}Neg = new ComputeRegionNetworkEndpointGroup(this, '${fnName}-neg', {
  name: '${fnName}-neg',
  region: '${lbConfig.region}',
  networkEndpointType: 'SERVERLESS',
  cloudFunction: {
    function: ${fnVar}Function.name,
  },
});

// Backend service for ${fnName}${iapConfig ? ' (IAP protected)' : ''}
// Note: timeoutSec and portName are not supported for serverless NEG backend services
const ${fnVar}Backend = new ComputeBackendService(this, '${fnName}-backend', {
  name: '${lbConfig.name}-${fnName}-backend',
  protocol: 'HTTP',
  backend: [{
    group: ${fnVar}Neg.selfLink,
  }],${iapBlock}
});`;
    }).join('\n\n');

    // Generate NEG and Backend for each unique Cloud Run container
    const containerNegBackendCode = uniqueContainers.map(containerName => {
      const containerVar = toVariableName(containerName);
      const iapConfig = iapWebBackendMap.get(containerName);
      const iapVarName = iapConfig ? toVariableName(iapConfig.name) : null;

      // Generate IAP block if this backend has IAP enabled
      const iapBlock = iapConfig ? `
  iap: {
    enabled: true,
    oauth2ClientId: ${iapVarName}Client.clientId,
    oauth2ClientSecret: ${iapVarName}Client.secret,
  },` : '';

      return `// Serverless NEG for Cloud Run ${containerName}
const ${containerVar}Neg = new ComputeRegionNetworkEndpointGroup(this, '${containerName}-neg', {
  name: '${containerName}-neg',
  region: '${lbConfig.region}',
  networkEndpointType: 'SERVERLESS',
  cloudRun: {
    service: ${containerVar}Service.name,
  },
});

// Backend service for ${containerName}${iapConfig ? ' (IAP protected)' : ''}
// Note: timeoutSec is not supported for serverless NEG backend services
const ${containerVar}Backend = new ComputeBackendService(this, '${containerName}-backend', {
  name: '${lbConfig.name}-${containerName}-backend',
  protocol: 'HTTP',
  backend: [{
    group: ${containerVar}Neg.selfLink,
  }],${iapBlock}
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
    const nonDefaultRoutes = routes.filter(r => r.path !== '/*' || r.host);

    // Check if we have host-based routing
    const hasHostRouting = routes.some(r => r.host);

    let urlMapConfig: string;
    if (nonDefaultRoutes.length === 0 && !hasHostRouting) {
      // Simple case: just one default route
      urlMapConfig = `// URL Map (Load Balancer routing)
const ${varName}UrlMap = new ComputeUrlMap(this, '${config.name}-urlmap', {
  name: '${config.name}',
  defaultService: ${defaultBackendRef},
});`;
    } else if (hasHostRouting) {
      // Host-based routing: group routes by host
      const routesByHost = new Map<string, RouteConfig[]>();

      for (const route of routes) {
        const host = route.host || '*';
        if (!routesByHost.has(host)) {
          routesByHost.set(host, []);
        }
        routesByHost.get(host)!.push(route);
      }

      // Generate host rules and path matchers
      const hostRulesCode: string[] = [];
      const pathMatchersCode: string[] = [];

      for (const [host, hostRoutes] of routesByHost) {
        const matcherName = host === '*' ? 'default-paths' : `${host.replace(/[^a-zA-Z0-9]/g, '-')}-paths`;

        // Find default backend for this host
        const hostDefaultRoute = hostRoutes.find(r => r.path === '/*');
        const hostDefaultBackend = hostDefaultRoute ? getBackendRef(hostDefaultRoute) : defaultBackendRef;
        const isDefaultRouteUI = hostDefaultRoute?.uiName;

        hostRulesCode.push(`    {
      hosts: ['${host}'],
      pathMatcher: '${matcherName}',
    }`);

        // Generate path rules for non-default paths
        const nonDefaultHostRoutes = hostRoutes.filter(r => r.path !== '/*');
        const pathRulesCode = nonDefaultHostRoutes.map((route) => {
          const backendRef = getBackendRef(route);
          const paths = [route.path];
          if (route.path.endsWith('/*')) {
            const basePath = route.path.slice(0, -2);
            if (basePath) {
              paths.unshift(basePath);
            }
          }
          const pathsStr = paths.map(p => `'${p}'`).join(', ');
          return `        {
          paths: [${pathsStr}],
          service: ${backendRef},
        }`;
        }).join(',\n');

        // For UI backends (SPAs), we need routeRules with URL rewriting
        // When a host has a UI as the default backend, use routeRules for proper SPA routing
        if (isDefaultRouteUI) {
          // Mixed host with SPA default - use routeRules for all paths
          // This enables URL rewriting for the SPA while routing other paths normally
          const routeRulesCode: string[] = [];
          let priority = 1;

          // First, add rules for specific paths (APIs, admin, etc.)
          for (const route of nonDefaultHostRoutes) {
            const backendRef = getBackendRef(route);
            // Convert path pattern to prefixMatch (remove trailing /*)
            const prefixPath = route.path.endsWith('/*')
              ? route.path.slice(0, -2)
              : route.path;

            routeRulesCode.push(`        {
          priority: ${priority},
          matchRules: [{
            prefixMatch: '${prefixPath}',
          }],
          service: ${backendRef},
        }`);
            priority++;
          }

          // Then add rules for the UI (SPA default)
          // Static assets - serve common asset directories as-is
          // Note: GCP URL Maps don't support regex, so we use prefix matching for known asset paths
          const assetPaths = ['/assets', '/static', '/_app', '/build'];
          for (const assetPath of assetPaths) {
            routeRulesCode.push(`        // Static assets from ${assetPath}/ - serve as-is
        {
          priority: ${priority},
          matchRules: [{
            prefixMatch: '${assetPath}/',
          }],
          service: ${hostDefaultBackend},
        }`);
            priority++;
          }

          // index.html - serve as-is (prevent rewrite loop)
          routeRulesCode.push(`        // index.html - serve as-is to prevent rewrite loop
        {
          priority: ${priority},
          matchRules: [{
            fullPathMatch: '/index.html',
          }],
          service: ${hostDefaultBackend},
        }`);
          priority++;

          // Common root-level static files (favicon, robots, etc.)
          const staticFiles = ['/favicon.ico', '/robots.txt', '/sitemap.xml', '/site.webmanifest'];
          for (const staticFile of staticFiles) {
            routeRulesCode.push(`        // Static file ${staticFile} - serve as-is
        {
          priority: ${priority},
          matchRules: [{
            fullPathMatch: '${staticFile}',
          }],
          service: ${hostDefaultBackend},
        }`);
            priority++;
          }

          // All other paths - rewrite to /index.html for SPA client-side routing
          routeRulesCode.push(`        // SPA routing - rewrite non-asset paths to /index.html
        {
          priority: ${priority},
          matchRules: [{
            prefixMatch: '/',
          }],
          service: ${hostDefaultBackend},
          routeAction: {
            urlRewrite: {
              pathPrefixRewrite: '/index.html',
            },
          },
        }`);

          pathMatchersCode.push(`    {
      name: '${matcherName}',
      defaultService: ${hostDefaultBackend},
      routeRules: [
${routeRulesCode.join(',\n')},
      ],
    }`);
        } else if (nonDefaultHostRoutes.length > 0) {
          pathMatchersCode.push(`    {
      name: '${matcherName}',
      defaultService: ${hostDefaultBackend},
      pathRule: [
${pathRulesCode},
      ],
    }`);
        } else {
          pathMatchersCode.push(`    {
      name: '${matcherName}',
      defaultService: ${hostDefaultBackend},
    }`);
        }
      }

      urlMapConfig = `// URL Map with host-based routing
const ${varName}UrlMap = new ComputeUrlMap(this, '${config.name}-urlmap', {
  name: '${config.name}',
  defaultService: ${defaultBackendRef},
  hostRule: [
${hostRulesCode.join(',\n')},
  ],
  pathMatcher: [
${pathMatchersCode.join(',\n')},
  ],
});`;
    } else {
      // Path-based routing only (no host specified)
      // Check if the default route is a UI (SPA)
      const isDefaultUI = defaultRoute?.uiName;

      if (isDefaultUI) {
        // SPA routing - use routeRules with URL rewriting
        const routeRulesCode: string[] = [];
        let priority = 1;

        // First, add rules for specific paths (APIs, etc.)
        for (const route of nonDefaultRoutes) {
          const backendRef = getBackendRef(route);
          const prefixPath = route.path.endsWith('/*')
            ? route.path.slice(0, -2)
            : route.path;

          routeRulesCode.push(`      {
        priority: ${priority},
        matchRules: [{
          prefixMatch: '${prefixPath}',
        }],
        service: ${backendRef},
      }`);
          priority++;
        }

        // Static assets - serve common asset directories as-is
        const assetPaths = ['/assets', '/static', '/_app', '/build'];
        for (const assetPath of assetPaths) {
          routeRulesCode.push(`      // Static assets from ${assetPath}/ - serve as-is
      {
        priority: ${priority},
        matchRules: [{
          prefixMatch: '${assetPath}/',
        }],
        service: ${defaultBackendRef},
      }`);
          priority++;
        }

        // index.html - serve as-is (prevent rewrite loop)
        routeRulesCode.push(`      // index.html - serve as-is to prevent rewrite loop
      {
        priority: ${priority},
        matchRules: [{
          fullPathMatch: '/index.html',
        }],
        service: ${defaultBackendRef},
      }`);
        priority++;

        // Common root-level static files
        const staticFiles = ['/favicon.ico', '/robots.txt', '/sitemap.xml', '/site.webmanifest'];
        for (const staticFile of staticFiles) {
          routeRulesCode.push(`      // Static file ${staticFile} - serve as-is
      {
        priority: ${priority},
        matchRules: [{
          fullPathMatch: '${staticFile}',
        }],
        service: ${defaultBackendRef},
      }`);
          priority++;
        }

        // All other paths - rewrite to /index.html for SPA
        routeRulesCode.push(`      // SPA routing - rewrite non-asset paths to /index.html
      {
        priority: ${priority},
        matchRules: [{
          prefixMatch: '/',
        }],
        service: ${defaultBackendRef},
        routeAction: {
          urlRewrite: {
            pathPrefixRewrite: '/index.html',
          },
        },
      }`);

        urlMapConfig = `// URL Map with path-based routing and SPA support
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
    routeRules: [
${routeRulesCode.join(',\n')},
    ],
  }],
});`;
      } else {
        // Non-SPA routing - use pathRule
        const pathRulesCode = nonDefaultRoutes.map((route) => {
          const backendRef = getBackendRef(route);
          // For paths like /admin/*, also include /admin (without trailing slash)
          const paths = [route.path];
          if (route.path.endsWith('/*')) {
            const basePath = route.path.slice(0, -2);
            if (basePath) {
              paths.unshift(basePath);
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
    }

    // Determine if HTTPS should be enabled
    const enableHttps = lbConfig.enableHttps && allDomains.length > 0;
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

      // Generate domains array for SSL cert
      const sslDomainsCode = allDomains.map(d => `'${d}'`).join(', ');

      httpsCode = `
// =============================================================================
// HTTPS Configuration with Managed SSL Certificate
// =============================================================================

// Managed SSL Certificate (auto-provisioned by Google)
// Supports up to 100 domains per certificate
const ${varName}SslCert = new ComputeManagedSslCertificate(this, '${config.name}-ssl-cert', {
  name: '${config.name}-ssl-cert',
  managed: {
    domains: [${sslDomainsCode}],
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

    // Generate Cloudflare DNS records if configured
    let dnsCode = '';
    if (lbConfig.dns?.provider === 'cloudflare' && allDomains.length > 0) {
      const zoneId = lbConfig.dns.zoneId || lbConfig.cloudflareZoneId;
      if (zoneId) {
        const proxied = lbConfig.dns.proxied ?? true;

        // Generate a DNS record for each domain
        const dnsRecords = allDomains.map((domain, index) => {
          // Extract subdomain from domain (e.g., "app.example.com" -> "app")
          const domainParts = domain.split('.');
          const recordName = domainParts.length > 2 ? domainParts[0] : '@';
          const recordVar = index === 0 ? `${varName}DnsRecord` : `${varName}DnsRecord${index + 1}`;

          return `// DNS record pointing ${domain} to load balancer IP
const ${recordVar} = new CloudflareRecord(this, '${config.name}-dns${index > 0 ? `-${index + 1}` : ''}', {
  zoneId: '${zoneId}',
  name: '${recordName}',
  type: 'A',
  value: ${varName}Ip.address,
  proxied: ${proxied},
  ttl: 1,
});`;
        }).join('\n\n');

        dnsCode = `

// =============================================================================
// Cloudflare DNS Records
// =============================================================================

${dnsRecords}`;
        imports.push(
          "import { Record as CloudflareRecord } from '@cdktf/provider-cloudflare/lib/record';",
        );
      }
    }

    const code = `${iapCode}${negBackendCode}

${urlMapConfig}

// Global IP Address
const ${varName}Ip = new ComputeGlobalAddress(this, '${config.name}-ip', {
  name: '${config.name}-ip',
  ${labelsCode}
});
${httpsCode}${httpRedirectCode}${httpOnlyCode}${dnsCode}`;

    // Build outputs
    const outputs = [
      `export const ${varName}LoadBalancerIp = ${varName}Ip.address;`,
    ];

    if (enableHttps && allDomains.length > 0) {
      outputs.push(
        `// HTTPS URLs: ${allDomains.map(d => `https://${d}`).join(', ')}`,
        `// Note: SSL certificate provisioning may take 15-60 minutes`,
      );
      if (lbConfig.dns?.provider === 'cloudflare') {
        outputs.push(
          `// DNS record auto-created via Cloudflare (proxied: ${lbConfig.dns.proxied ?? true})`,
        );
      } else {
        outputs.push(
          `// DNS must point ${allDomains.join(', ')} to the load balancer IP`,
        );
      }
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
