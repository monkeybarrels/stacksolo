import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export const GET: RequestHandler = async ({ url }) => {
  const service = url.searchParams.get('service') || 'all';
  const encoder = new TextEncoder();
  const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();

  // Read config to get namespace (fallback to 'default' if config can't be read)
  let namespace = 'default';
  try {
    const configPath = path.join(projectPath, '.stacksolo', 'stacksolo.config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    namespace = config.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  } catch {
    // Use default
  }

  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Build kubectl logs command
      const args = ['logs', '-n', namespace, '--all-containers=true', '-f', '--tail=100', '--max-log-requests=20'];

      if (service === 'all') {
        args.push('-l', 'app.kubernetes.io/name'); // All pods with app label
      } else {
        args.push('-l', `app.kubernetes.io/name=${service}`);
      }

      const proc = spawn('kubectl', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const sendLog = (line: string, type: 'stdout' | 'stderr') => {
        if (isClosed || !line.trim()) return;

        // Parse pod name from log line if present
        let logService: string | undefined;
        let message = line;

        // kubectl logs format: "podname message" or just "message"
        const podMatch = line.match(/^([a-z0-9-]+)\s+(.*)$/i);
        if (podMatch) {
          logService = podMatch[1].replace(/-[a-z0-9]+-[a-z0-9]+$/, '');
          message = podMatch[2];
        }

        // Determine log level
        let level: 'info' | 'success' | 'warning' | 'error' = 'info';
        const lowerLine = line.toLowerCase();

        if (lowerLine.includes('error') || lowerLine.includes('failed') || type === 'stderr') {
          level = 'error';
        } else if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
          level = 'warning';
        } else if (lowerLine.includes('success') || lowerLine.includes('ready') || lowerLine.includes('listening')) {
          level = 'success';
        }

        const data = JSON.stringify({
          timestamp: new Date().toISOString(),
          message,
          level,
          service: logService,
        });

        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller closed
        }
      };

      proc.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => sendLog(line, 'stdout'));
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        // Handle "No resources found" message specially
        if (text.includes('No resources found')) {
          const infoData = JSON.stringify({
            timestamp: new Date().toISOString(),
            message: 'No pods running. Start the dev environment to see logs.',
            level: 'info',
            service: 'system',
          });
          try {
            controller.enqueue(encoder.encode(`data: ${infoData}\n\n`));
          } catch {
            // Ignore
          }
          return;
        }
        const lines = text.split('\n');
        lines.forEach((line: string) => sendLog(line, 'stderr'));
      });

      proc.on('error', (err) => {
        // kubectl not available or namespace doesn't exist
        const data = JSON.stringify({
          timestamp: new Date().toISOString(),
          message: `Log streaming unavailable: ${err.message}. Start the dev environment first.`,
          level: 'warning',
          service: 'system',
        });
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Ignore
        }
      });

      proc.on('close', () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      });

      // Cleanup function
      return () => {
        isClosed = true;
        proc.kill();
      };
    },
    cancel() {
      isClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
