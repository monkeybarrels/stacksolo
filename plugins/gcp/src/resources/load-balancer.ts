import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const loadBalancer = defineResource({
  id: 'gcp:load_balancer',
  provider: 'gcp',
  name: 'HTTP(S) Load Balancer',
  description: 'Global load balancer for HTTP/HTTPS traffic with SSL termination',
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
      backendType: {
        type: 'string',
        title: 'Backend Type',
        description: 'Type of backend service',
        default: 'bucket',
        enum: ['bucket', 'cloudrun', 'instanceGroup'],
      },
      bucketName: {
        type: 'string',
        title: 'Backend Bucket',
        description: 'Storage bucket name (for static sites)',
      },
      cloudRunService: {
        type: 'string',
        title: 'Cloud Run Service',
        description: 'Cloud Run service name',
      },
      cloudRunRegion: {
        type: 'string',
        title: 'Cloud Run Region',
        description: 'Region of the Cloud Run service',
        default: 'us-central1',
      },
      enableCdn: {
        type: 'boolean',
        title: 'Enable CDN',
        description: 'Enable Cloud CDN for caching',
        default: true,
      },
      sslCertificate: {
        type: 'string',
        title: 'SSL Certificate',
        description: 'Managed SSL certificate domains (comma-separated)',
      },
      enableHttp: {
        type: 'boolean',
        title: 'Allow HTTP',
        description: 'Allow unencrypted HTTP traffic',
        default: false,
      },
    },
    required: ['name', 'backendType'],
  },

  defaultConfig: {
    backendType: 'bucket',
    enableCdn: true,
    enableHttp: false,
    cloudRunRegion: 'us-central1',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const lbConfig = config as {
      name: string;
      backendType: string;
      bucketName?: string;
      cloudRunService?: string;
      cloudRunRegion?: string;
      enableCdn?: boolean;
      sslCertificate?: string;
      enableHttp?: boolean;
    };

    const enableCdn = lbConfig.enableCdn !== false;
    let code = '';

    // Backend bucket for static sites
    if (lbConfig.backendType === 'bucket' && lbConfig.bucketName) {
      code = `const ${varName}BackendBucket = new gcp.compute.BackendBucket("${config.name}-backend", {
  name: "${config.name}-backend",
  bucketName: "${lbConfig.bucketName}",
  enableCdn: ${enableCdn},
});

const ${varName}UrlMap = new gcp.compute.URLMap("${config.name}-urlmap", {
  name: "${config.name}-urlmap",
  defaultService: ${varName}BackendBucket.selfLink,
});`;
    }
    // Cloud Run backend
    else if (lbConfig.backendType === 'cloudrun' && lbConfig.cloudRunService) {
      const region = lbConfig.cloudRunRegion || 'us-central1';
      code = `const ${varName}Neg = new gcp.compute.RegionNetworkEndpointGroup("${config.name}-neg", {
  name: "${config.name}-neg",
  region: "${region}",
  networkEndpointType: "SERVERLESS",
  cloudRun: {
    service: "${lbConfig.cloudRunService}",
  },
});

const ${varName}BackendService = new gcp.compute.BackendService("${config.name}-backend", {
  name: "${config.name}-backend",
  backends: [{
    group: ${varName}Neg.selfLink,
  }],
  enableCdn: ${enableCdn},
});

const ${varName}UrlMap = new gcp.compute.URLMap("${config.name}-urlmap", {
  name: "${config.name}-urlmap",
  defaultService: ${varName}BackendService.selfLink,
});`;
    }

    // SSL Certificate
    if (lbConfig.sslCertificate) {
      const domains = lbConfig.sslCertificate.split(',').map(d => d.trim());
      code += `

const ${varName}SslCert = new gcp.compute.ManagedSslCertificate("${config.name}-ssl", {
  name: "${config.name}-ssl",
  managed: {
    domains: ${JSON.stringify(domains)},
  },
});

const ${varName}HttpsProxy = new gcp.compute.TargetHttpsProxy("${config.name}-https-proxy", {
  name: "${config.name}-https-proxy",
  urlMap: ${varName}UrlMap.selfLink,
  sslCertificates: [${varName}SslCert.selfLink],
});

const ${varName}HttpsForwardingRule = new gcp.compute.GlobalForwardingRule("${config.name}-https", {
  name: "${config.name}-https",
  target: ${varName}HttpsProxy.selfLink,
  portRange: "443",
  ipProtocol: "TCP",
});`;
    }

    // HTTP (optional)
    if (lbConfig.enableHttp) {
      code += `

const ${varName}HttpProxy = new gcp.compute.TargetHttpProxy("${config.name}-http-proxy", {
  name: "${config.name}-http-proxy",
  urlMap: ${varName}UrlMap.selfLink,
});

const ${varName}HttpForwardingRule = new gcp.compute.GlobalForwardingRule("${config.name}-http", {
  name: "${config.name}-http",
  target: ${varName}HttpProxy.selfLink,
  portRange: "80",
  ipProtocol: "TCP",
});`;
    }

    const outputs = [`export const ${varName}UrlMapId = ${varName}UrlMap.id;`];
    if (lbConfig.sslCertificate) {
      outputs.push(`export const ${varName}HttpsIp = ${varName}HttpsForwardingRule.ipAddress;`);
    }
    if (lbConfig.enableHttp) {
      outputs.push(`export const ${varName}HttpIp = ${varName}HttpForwardingRule.ipAddress;`);
    }

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs,
    };
  },

  estimateCost: () => ({
    monthly: 18,
    currency: 'USD',
    breakdown: [
      { item: 'Forwarding rule (first 5 free)', amount: 0 },
      { item: 'Data processing ($0.008/GB)', amount: 8 },
      { item: 'Backend service', amount: 10 },
    ],
  }),
});
