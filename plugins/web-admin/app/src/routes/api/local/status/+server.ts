import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

interface StackSoloConfig {
  project: {
    name: string;
  };
}

interface PodMetrics {
  cpu: number; // millicores
  memory: number; // bytes
}

function parseResourceValue(value: string): number {
  if (!value) return 0;

  // CPU: "100m" = 100 millicores, "1" = 1000 millicores
  if (value.endsWith('m')) {
    return parseInt(value.slice(0, -1), 10);
  }
  if (value.endsWith('n')) {
    return parseInt(value.slice(0, -1), 10) / 1000000;
  }

  // Memory: "100Mi" = 100 * 1024 * 1024 bytes
  if (value.endsWith('Ki')) {
    return parseInt(value.slice(0, -2), 10) * 1024;
  }
  if (value.endsWith('Mi')) {
    return parseInt(value.slice(0, -2), 10) * 1024 * 1024;
  }
  if (value.endsWith('Gi')) {
    return parseInt(value.slice(0, -2), 10) * 1024 * 1024 * 1024;
  }

  return parseFloat(value) || 0;
}

export const GET: RequestHandler = async () => {
  try {
    const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();
    const configPath = path.join(projectPath, '.stacksolo', 'stacksolo.config.json');

    // Read config to get namespace
    let namespace = 'default';
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config: StackSoloConfig = JSON.parse(configContent);
      namespace = config.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    } catch {
      // Use default namespace
    }

    // Check if namespace exists and has running pods
    let running = false;
    let oldestStartTime: Date | null = null;
    const services: Array<{
      name: string;
      status: string;
      port?: number;
      url?: string;
    }> = [];

    try {
      const podsOutput = execSync(
        `kubectl get pods -n ${namespace} -o json 2>/dev/null`,
        { encoding: 'utf-8' }
      );
      const pods = JSON.parse(podsOutput);

      if (pods.items && pods.items.length > 0) {
        running = true;

        for (const pod of pods.items) {
          const name = pod.metadata.name.replace(/-[a-z0-9]+-[a-z0-9]+$/, ''); // Remove pod suffix
          const phase = pod.status.phase;
          const ready = pod.status.containerStatuses?.[0]?.ready || false;

          // Track oldest start time for uptime calculation
          const startTime = pod.status.startTime;
          if (startTime) {
            const podStart = new Date(startTime);
            if (!oldestStartTime || podStart < oldestStartTime) {
              oldestStartTime = podStart;
            }
          }

          services.push({
            name,
            status: ready ? 'running' : phase.toLowerCase(),
          });
        }
      }

      // Get services to find ports
      const svcOutput = execSync(
        `kubectl get svc -n ${namespace} -o json 2>/dev/null`,
        { encoding: 'utf-8' }
      );
      const svcs = JSON.parse(svcOutput);

      for (const svc of svcs.items || []) {
        const svcName = svc.metadata.name;
        const port = svc.spec.ports?.[0]?.port;

        // Find matching service entry and add port
        const service = services.find(s => svcName.includes(s.name) || s.name.includes(svcName));
        if (service && port) {
          service.port = port;
          service.url = `http://localhost:${port}`;
        }
      }
    } catch {
      // kubectl failed, dev environment not running
      running = false;
    }

    // Get resource metrics using kubectl top
    let totalCpuMillicores = 0;
    let totalMemoryBytes = 0;

    if (running) {
      try {
        const topOutput = execSync(
          `kubectl top pods -n ${namespace} --no-headers 2>/dev/null`,
          { encoding: 'utf-8' }
        );

        // Parse output: "pod-name   100m   256Mi"
        const lines = topOutput.trim().split('\n').filter(l => l.trim());
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const cpu = parts[1]; // e.g., "100m"
            const mem = parts[2]; // e.g., "256Mi"

            totalCpuMillicores += parseResourceValue(cpu);
            totalMemoryBytes += parseResourceValue(mem);
          }
        }
      } catch {
        // kubectl top might not be available (requires metrics-server)
        // Fall back to resource requests/limits from pod spec
        try {
          const podsOutput = execSync(
            `kubectl get pods -n ${namespace} -o json 2>/dev/null`,
            { encoding: 'utf-8' }
          );
          const pods = JSON.parse(podsOutput);

          for (const pod of pods.items || []) {
            for (const container of pod.spec.containers || []) {
              const requests = container.resources?.requests || {};
              totalCpuMillicores += parseResourceValue(requests.cpu || '0');
              totalMemoryBytes += parseResourceValue(requests.memory || '0');
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    // Deduplicate services by name
    const uniqueServices = services.filter(
      (s, i, arr) => arr.findIndex(x => x.name === s.name) === i
    );

    // Calculate uptime in seconds
    const uptime = oldestStartTime
      ? Math.floor((Date.now() - oldestStartTime.getTime()) / 1000)
      : 0;

    // Convert CPU to percentage (assuming 1 core = 1000 millicores = 100%)
    const cpuPercent = totalCpuMillicores / 10; // 1000m = 100%

    // Convert memory to MB
    const memoryMB = totalMemoryBytes / (1024 * 1024);

    return json({
      running,
      services: uniqueServices,
      cpu: cpuPercent,
      memory: memoryMB,
      uptime,
    });
  } catch (err) {
    console.error('Failed to get local dev status:', err);
    return json({
      running: false,
      services: [],
      cpu: 0,
      memory: 0,
      uptime: 0,
    });
  }
};
