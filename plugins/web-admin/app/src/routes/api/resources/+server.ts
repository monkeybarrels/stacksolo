import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as fs from 'fs/promises';
import * as path from 'path';

interface StackSoloConfig {
  project: {
    name: string;
    gcpProjectId: string;
    region: string;
    kernel?: { name: string };
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
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: StackSoloConfig = JSON.parse(configContent);

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
      for (const container of network.containers || []) {
        resources.push({
          id: `container-${container.name}`,
          type: 'Cloud Run',
          name: container.name,
          status: 'pending',
          provider: 'gcp',
          region: config.project.region,
        });
      }
      for (const db of network.databases || []) {
        resources.push({
          id: `db-${db.name}`,
          type: 'Cloud SQL',
          name: db.name,
          status: 'pending',
          provider: 'gcp',
          region: config.project.region,
        });
      }
      for (const bucket of network.buckets || []) {
        resources.push({
          id: `bucket-${bucket.name}`,
          type: 'Cloud Storage',
          name: bucket.name,
          status: 'pending',
          provider: 'gcp',
          region: config.project.region,
        });
      }
      for (const cache of network.caches || []) {
        resources.push({
          id: `cache-${cache.name}`,
          type: 'Memorystore',
          name: cache.name,
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

    return json(resources);
  } catch (err) {
    console.error('Failed to read config:', err);
    return json([], { status: 500 });
  }
};
