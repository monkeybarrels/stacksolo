import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as fs from 'fs/promises';
import * as path from 'path';

interface StackSoloConfig {
  project: {
    name: string;
    gcpProjectId: string;
    region: string;
    backend?: string;
    plugins?: string[];
    kernel?: { name: string };
    webAdmin?: { enabled: boolean; port?: number };
    networks?: Array<{
      name: string;
      loadBalancer?: { name: string; routes: Array<{ path: string; backend: string }> };
      functions?: Array<{ name: string; runtime: string; entryPoint: string; memory: string; timeout: number }>;
      uis?: Array<{ name: string; framework: string }>;
      containers?: Array<{ name: string }>;
      databases?: Array<{ name: string }>;
      buckets?: Array<{ name: string }>;
      caches?: Array<{ name: string }>;
    }>;
  };
}

export const GET: RequestHandler = async () => {
  const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();
  const configPath = path.join(projectPath, '.stacksolo', 'stacksolo.config.json');

  try {
    // Read config directly from file
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: StackSoloConfig = JSON.parse(configContent);

    // Count resources from config
    let functions = 0;
    let containers = 0;
    let databases = 0;
    let storage = 0;
    let cache = 0;
    let loadBalancers = 0;

    for (const network of config.project.networks || []) {
      functions += network.functions?.length || 0;
      containers += network.containers?.length || 0;
      databases += network.databases?.length || 0;
      storage += network.buckets?.length || 0;
      cache += network.caches?.length || 0;
      if (network.loadBalancer) loadBalancers += 1;
    }

    // Add UIs as containers (they run in containers)
    for (const network of config.project.networks || []) {
      containers += network.uis?.length || 0;
    }

    // Add kernel as container if present
    if (config.project.kernel) {
      containers += 1;
    }

    // Build resources list
    const resources: Array<{
      id: string;
      type: string;
      name: string;
      status: string;
      provider: string;
      region?: string;
      url?: string;
    }> = [];

    for (const network of config.project.networks || []) {
      for (const func of network.functions || []) {
        resources.push({
          id: `function-${func.name}`,
          type: 'Cloud Function',
          name: func.name,
          status: 'pending',
          provider: 'gcp',
          region: config.project.region,
        });
      }
      for (const ui of network.uis || []) {
        resources.push({
          id: `ui-${ui.name}`,
          type: 'Cloud Run (UI)',
          name: ui.name,
          status: 'pending',
          provider: 'gcp',
          region: config.project.region,
        });
      }
      if (network.loadBalancer) {
        resources.push({
          id: `lb-${network.loadBalancer.name}`,
          type: 'Load Balancer',
          name: network.loadBalancer.name,
          status: 'pending',
          provider: 'gcp',
          region: config.project.region,
        });
      }
    }

    if (config.project.kernel) {
      resources.push({
        id: `kernel-${config.project.kernel.name}`,
        type: 'Cloud Run (Kernel)',
        name: config.project.kernel.name,
        status: 'pending',
        provider: 'gcp',
        region: config.project.region,
      });
    }

    return json({
      project: {
        name: config.project.name,
        provider: 'gcp',
        projectId: config.project.gcpProjectId,
        region: config.project.region,
        resources,
        resourceCounts: {
          functions,
          containers,
          databases,
          storage,
          cache,
          loadBalancers,
        },
      },
      activities: [],
    });
  } catch (err) {
    console.error('Failed to read config:', err);
    console.error('Tried path:', configPath);
    console.error('STACKSOLO_PROJECT_PATH:', process.env.STACKSOLO_PROJECT_PATH);
    return json(
      {
        project: null,
        activities: [],
        error: `Failed to read config from ${configPath}: ${err instanceof Error ? err.message : err}`,
      },
      { status: 500 }
    );
  }
};
