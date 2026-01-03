import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { service } = await request.json();

    if (!service) {
      return json({ error: 'Service name required' }, { status: 400 });
    }

    const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();
    const configPath = path.join(projectPath, '.stacksolo', 'stacksolo.config.json');

    // Read config to get namespace
    let namespace = 'default';
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      namespace = config.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    } catch {
      // Use default namespace
    }

    // Restart the deployment by doing a rollout restart
    try {
      execSync(
        `kubectl rollout restart deployment/${service} -n ${namespace} 2>/dev/null`,
        { encoding: 'utf-8' }
      );

      return json({ success: true, message: `Restarting ${service}...` });
    } catch (err) {
      // Try to restart by scaling down and up if rollout restart fails
      try {
        execSync(
          `kubectl scale deployment/${service} -n ${namespace} --replicas=0 2>/dev/null && kubectl scale deployment/${service} -n ${namespace} --replicas=1 2>/dev/null`,
          { encoding: 'utf-8' }
        );

        return json({ success: true, message: `Restarting ${service}...` });
      } catch {
        return json(
          { error: `Failed to restart ${service}. Deployment may not exist.` },
          { status: 500 }
        );
      }
    }
  } catch (err) {
    console.error('Failed to restart service:', err);
    return json({ error: 'Failed to restart service' }, { status: 500 });
  }
};
