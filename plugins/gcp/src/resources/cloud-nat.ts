import { defineResource, type ResourceConfig } from '@stacksolo/core';

function toVariableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

export const cloudNat = defineResource({
  id: 'gcp:cloud_nat',
  provider: 'gcp',
  name: 'Cloud NAT',
  description: 'Network Address Translation for private instances to access the internet',
  icon: 'swap_horiz',

  configSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'NAT Name',
        description: 'Unique name for the Cloud NAT',
        minLength: 1,
        maxLength: 63,
      },
      region: {
        type: 'string',
        title: 'Region',
        description: 'Region for the NAT gateway',
        default: 'us-central1',
      },
      network: {
        type: 'string',
        title: 'Network',
        description: 'VPC network name',
      },
      subnetworks: {
        type: 'array',
        title: 'Subnetworks',
        description: 'Specific subnets to NAT (empty = all subnets)',
      },
      natIpAllocateOption: {
        type: 'string',
        title: 'IP Allocation',
        description: 'How to allocate NAT IPs',
        default: 'AUTO_ONLY',
        enum: ['AUTO_ONLY', 'MANUAL_ONLY'],
      },
      sourceSubnetworkIpRangesToNat: {
        type: 'string',
        title: 'Subnet IP Ranges',
        description: 'Which subnet IP ranges to NAT',
        default: 'ALL_SUBNETWORKS_ALL_IP_RANGES',
        enum: ['ALL_SUBNETWORKS_ALL_IP_RANGES', 'ALL_SUBNETWORKS_ALL_PRIMARY_IP_RANGES', 'LIST_OF_SUBNETWORKS'],
      },
      minPortsPerVm: {
        type: 'number',
        title: 'Min Ports Per VM',
        description: 'Minimum ports allocated per VM',
        default: 64,
        minimum: 32,
        maximum: 65536,
      },
      maxPortsPerVm: {
        type: 'number',
        title: 'Max Ports Per VM',
        description: 'Maximum ports allocated per VM (for dynamic allocation)',
        minimum: 32,
        maximum: 65536,
      },
      enableDynamicPortAllocation: {
        type: 'boolean',
        title: 'Dynamic Port Allocation',
        description: 'Dynamically allocate ports based on usage',
        default: false,
      },
      enableEndpointIndependentMapping: {
        type: 'boolean',
        title: 'Endpoint Independent Mapping',
        description: 'Enable for protocols like SIP, H.323',
        default: true,
      },
      icmpIdleTimeoutSec: {
        type: 'number',
        title: 'ICMP Idle Timeout (sec)',
        description: 'Timeout for ICMP connections',
        default: 30,
      },
      tcpEstablishedIdleTimeoutSec: {
        type: 'number',
        title: 'TCP Established Timeout (sec)',
        description: 'Timeout for established TCP connections',
        default: 1200,
      },
      tcpTransitoryIdleTimeoutSec: {
        type: 'number',
        title: 'TCP Transitory Timeout (sec)',
        description: 'Timeout for transitory TCP connections',
        default: 30,
      },
      udpIdleTimeoutSec: {
        type: 'number',
        title: 'UDP Idle Timeout (sec)',
        description: 'Timeout for UDP connections',
        default: 30,
      },
      enableLogging: {
        type: 'boolean',
        title: 'Enable Logging',
        description: 'Log NAT translations',
        default: false,
      },
      logFilter: {
        type: 'string',
        title: 'Log Filter',
        description: 'What to log',
        default: 'ALL',
        enum: ['ALL', 'ERRORS_ONLY', 'TRANSLATIONS_ONLY'],
      },
    },
    required: ['name', 'network'],
  },

  defaultConfig: {
    region: 'us-central1',
    natIpAllocateOption: 'AUTO_ONLY',
    sourceSubnetworkIpRangesToNat: 'ALL_SUBNETWORKS_ALL_IP_RANGES',
    minPortsPerVm: 64,
    enableDynamicPortAllocation: false,
    enableEndpointIndependentMapping: true,
    icmpIdleTimeoutSec: 30,
    tcpEstablishedIdleTimeoutSec: 1200,
    tcpTransitoryIdleTimeoutSec: 30,
    udpIdleTimeoutSec: 30,
    enableLogging: false,
    logFilter: 'ALL',
  },

  generatePulumi: (config: ResourceConfig) => {
    const varName = toVariableName(config.name);
    const natConfig = config as {
      name: string;
      region?: string;
      network: string;
      natIpAllocateOption?: string;
      sourceSubnetworkIpRangesToNat?: string;
      minPortsPerVm?: number;
      maxPortsPerVm?: number;
      enableDynamicPortAllocation?: boolean;
      enableEndpointIndependentMapping?: boolean;
      icmpIdleTimeoutSec?: number;
      tcpEstablishedIdleTimeoutSec?: number;
      tcpTransitoryIdleTimeoutSec?: number;
      udpIdleTimeoutSec?: number;
      enableLogging?: boolean;
      logFilter?: string;
    };

    const region = natConfig.region || 'us-central1';

    // First create a router for the NAT
    let code = `const ${varName}Router = new gcp.compute.Router("${config.name}-router", {
  name: "${config.name}-router",
  region: "${region}",
  network: "${natConfig.network}",
});

const ${varName}Nat = new gcp.compute.RouterNat("${config.name}", {
  name: "${config.name}",
  router: ${varName}Router.name,
  region: "${region}",
  natIpAllocateOption: "${natConfig.natIpAllocateOption || 'AUTO_ONLY'}",
  sourceSubnetworkIpRangesToNat: "${natConfig.sourceSubnetworkIpRangesToNat || 'ALL_SUBNETWORKS_ALL_IP_RANGES'}",`;

    if (natConfig.minPortsPerVm) {
      code += `\n  minPortsPerVm: ${natConfig.minPortsPerVm},`;
    }

    if (natConfig.enableDynamicPortAllocation && natConfig.maxPortsPerVm) {
      code += `\n  enableDynamicPortAllocation: true,`;
      code += `\n  maxPortsPerVm: ${natConfig.maxPortsPerVm},`;
    }

    if (natConfig.enableEndpointIndependentMapping !== false) {
      code += `\n  enableEndpointIndependentMapping: true,`;
    }

    if (natConfig.icmpIdleTimeoutSec) {
      code += `\n  icmpIdleTimeoutSec: ${natConfig.icmpIdleTimeoutSec},`;
    }
    if (natConfig.tcpEstablishedIdleTimeoutSec) {
      code += `\n  tcpEstablishedIdleTimeoutSec: ${natConfig.tcpEstablishedIdleTimeoutSec},`;
    }
    if (natConfig.tcpTransitoryIdleTimeoutSec) {
      code += `\n  tcpTransitoryIdleTimeoutSec: ${natConfig.tcpTransitoryIdleTimeoutSec},`;
    }
    if (natConfig.udpIdleTimeoutSec) {
      code += `\n  udpIdleTimeoutSec: ${natConfig.udpIdleTimeoutSec},`;
    }

    if (natConfig.enableLogging) {
      code += `\n  logConfig: {
    enable: true,
    filter: "${natConfig.logFilter || 'ALL'}",
  },`;
    }

    code += '\n});';

    return {
      imports: ["import * as gcp from '@pulumi/gcp';"],
      code,
      outputs: [
        `export const ${varName}NatName = ${varName}Nat.name;`,
        `export const ${varName}RouterName = ${varName}Router.name;`,
      ],
    };
  },

  estimateCost: () => ({
    monthly: 1,
    currency: 'USD',
    breakdown: [
      { item: 'NAT gateway ($0.044/hr)', amount: 32 },
      { item: 'Data processing ($0.045/GB)', amount: 0 },
    ],
  }),
});
