import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudCdn = defineResource({
  id: 'gcp:cdn',
  provider: 'gcp',
  name: 'Cloud CDN',
  description: 'Content delivery network for static assets with edge caching',
  icon: 'public',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'CDN Name',
        description: 'Unique name for the CDN configuration',
        minLength: 1,
        maxLength: 63,
      },
      bucketName: {
        type: 'string',
        title: 'Origin Bucket',
        description: 'Storage bucket to serve content from',
      },
      cacheMode: {
        type: 'string',
        title: 'Cache Mode',
        description: 'How to determine caching behavior',
        default: 'CACHE_ALL_STATIC',
        enum: ['CACHE_ALL_STATIC', 'USE_ORIGIN_HEADERS', 'FORCE_CACHE_ALL'],
      },
      defaultTtl: {
        type: 'number',
        title: 'Default TTL (seconds)',
        description: 'Default cache TTL when origin has no cache headers',
        default: 3600,
      },
      maxTtl: {
        type: 'number',
        title: 'Max TTL (seconds)',
        description: 'Maximum cache TTL',
        default: 86400,
      },
      clientTtl: {
        type: 'number',
        title: 'Client TTL (seconds)',
        description: 'TTL for client-side caching',
        default: 3600,
      },
      negativeCaching: {
        type: 'boolean',
        title: 'Negative Caching',
        description: 'Cache 404 and other error responses',
        default: true,
      },
      serveWhileStale: {
        type: 'number',
        title: 'Serve While Stale (seconds)',
        description: 'Serve stale content while revalidating',
        default: 86400,
      },
      signedUrlCacheMaxAge: {
        type: 'number',
        title: 'Signed URL Max Age (seconds)',
        description: 'Max age for signed URL caching',
      },
    },
    required: ['name', 'bucketName'],
  },

  defaultConfig: {
    cacheMode: 'CACHE_ALL_STATIC',
    defaultTtl: 3600,
    maxTtl: 86400,
    clientTtl: 3600,
    negativeCaching: true,
    serveWhileStale: 86400,
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const cdnConfig = config as {
      name: string;
      bucketName: string;
      cacheMode?: string;
      defaultTtl?: number;
      maxTtl?: number;
      clientTtl?: number;
      negativeCaching?: boolean;
      serveWhileStale?: number;
      signedUrlCacheMaxAge?: number;
    };

    const cacheMode = cdnConfig.cacheMode || 'CACHE_ALL_STATIC';
    const defaultTtl = cdnConfig.defaultTtl ?? 3600;
    const maxTtl = cdnConfig.maxTtl ?? 86400;
    const clientTtl = cdnConfig.clientTtl ?? 3600;
    const negativeCaching = cdnConfig.negativeCaching !== false;
    const serveWhileStale = cdnConfig.serveWhileStale ?? 86400;

    let code = `const ${varName}BackendBucket = new gcp.compute.BackendBucket("${config.name}", {
  name: "${config.name}",
  bucketName: "${cdnConfig.bucketName}",
  enableCdn: true,
  cdnPolicy: {
    cacheMode: "${cacheMode}",
    defaultTtl: ${defaultTtl},
    maxTtl: ${maxTtl},
    clientTtl: ${clientTtl},
    negativeCaching: ${negativeCaching},
    serveWhileStale: ${serveWhileStale},`;

    if (cdnConfig.signedUrlCacheMaxAge) {
      code += `\n    signedUrlCacheMaxAgeSec: ${cdnConfig.signedUrlCacheMaxAge},`;
    }

    code += `
  },
});

const ${varName}UrlMap = new gcp.compute.URLMap("${config.name}-urlmap", {
  name: "${config.name}-urlmap",
  defaultService: ${varName}BackendBucket.selfLink,
});

const ${varName}HttpProxy = new gcp.compute.TargetHttpProxy("${config.name}-http-proxy", {
  name: "${config.name}-http-proxy",
  urlMap: ${varName}UrlMap.selfLink,
});

const ${varName}ForwardingRule = new gcp.compute.GlobalForwardingRule("${config.name}-forwarding", {
  name: "${config.name}-forwarding",
  target: ${varName}HttpProxy.selfLink,
  portRange: "80",
  ipProtocol: "TCP",
});`;

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}CdnIp = ${varName}ForwardingRule.ipAddress;`,
        `export const ${varName}CdnUrl = pulumi.interpolate\`http://\${${varName}ForwardingRule.ipAddress}\`;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 0,
    currency: 'USD',
    breakdown: [
      { item: 'Cache egress ($0.02-0.08/GB)', amount: 0 },
      { item: 'Cache fill ($0.01/GB)', amount: 0 },
      { item: 'HTTP requests ($0.0075/10K)', amount: 0 },
    ],
  }),
});
