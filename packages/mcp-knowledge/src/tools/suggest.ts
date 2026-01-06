/**
 * Suggest Tool
 *
 * Suggests configuration based on app description.
 */

import type { Tool } from './types';

export const suggestTool: Tool = {
  definition: {
    name: 'stacksolo_suggest',
    description:
      'Get a suggested configuration based on what the user wants to build. Describe the app and get a recommended config.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description:
            'Description of what the user wants to build (e.g., "Next.js app with PostgreSQL database and Redis cache")',
        },
      },
      required: ['description'],
    },
  },
  handler: async (args) => {
    const { description } = args as { description: string };
    const lowerDesc = description.toLowerCase();

    let suggestion = '# Suggested Configuration\n\n';
    suggestion += `Based on: "${description}"\n\n`;

    // Detect what resources are needed
    const needsDatabase =
      lowerDesc.includes('database') ||
      lowerDesc.includes('postgres') ||
      lowerDesc.includes('mysql') ||
      lowerDesc.includes('sql');
    const needsRedis =
      lowerDesc.includes('redis') ||
      lowerDesc.includes('cache') ||
      lowerDesc.includes('session');
    const needsStorage =
      lowerDesc.includes('upload') ||
      lowerDesc.includes('file') ||
      lowerDesc.includes('image') ||
      lowerDesc.includes('storage');
    const isNextjs = lowerDesc.includes('next') || lowerDesc.includes('nextjs');
    const isApi =
      lowerDesc.includes('api') ||
      lowerDesc.includes('backend') ||
      lowerDesc.includes('server');
    const hasUI =
      lowerDesc.includes('frontend') ||
      lowerDesc.includes('ui') ||
      lowerDesc.includes('web') ||
      isNextjs;
    const isFunction =
      lowerDesc.includes('function') ||
      lowerDesc.includes('serverless') ||
      lowerDesc.includes('lambda');
    const needsFirebase =
      lowerDesc.includes('firebase') || lowerDesc.includes('auth');

    // Build config
    const config: Record<string, unknown> = {
      project: {
        name: 'my-app',
        gcpProjectId: 'YOUR_GCP_PROJECT_ID',
        region: 'us-central1',
        networks: [
          {
            name: 'main',
          } as Record<string, unknown>,
        ],
      },
    };

    const project = config.project as Record<string, unknown>;
    const network = (project.networks as Record<string, unknown>[])[0];

    // Add Firebase/kernel config if needed
    if (needsFirebase) {
      project.plugins = [
        '@stacksolo/plugin-gcp-cdktf',
        '@stacksolo/plugin-gcp-kernel',
      ];
      project.gcpKernel = {
        name: 'kernel',
        firebaseProjectId: 'YOUR_GCP_PROJECT_ID',
      };
      project.firebaseEmulators = { enabled: true };
    }

    // Add resources based on detection
    if (isNextjs || (isApi && !isFunction)) {
      const containerEnv: Record<string, string> = {};
      if (needsDatabase) {
        containerEnv['DATABASE_URL'] = '@sql/db.connectionString';
      }
      if (needsRedis) {
        containerEnv['REDIS_URL'] = '@redis/cache.url';
      }
      if (needsFirebase) {
        containerEnv['KERNEL_URL'] = '@gcp-kernel/kernel.url';
        containerEnv['KERNEL_TYPE'] = 'gcp';
      }

      network.containers = [
        {
          name: isNextjs ? 'web' : 'api',
          port: isNextjs ? 3000 : 8080,
          allowUnauthenticated: true,
          env: containerEnv,
        },
      ];
    } else if (isFunction || isApi) {
      const functionEnv: Record<string, string> = {};
      if (needsDatabase) {
        functionEnv['DATABASE_URL'] = '@sql/db.connectionString';
      }
      if (needsFirebase) {
        functionEnv['KERNEL_URL'] = '@gcp-kernel/kernel.url';
        functionEnv['KERNEL_TYPE'] = 'gcp';
      }

      network.functions = [
        {
          name: 'api',
          runtime: 'nodejs20',
          entryPoint: 'handler',
          allowUnauthenticated: true,
          env: functionEnv,
        },
      ];
    }

    if (hasUI && !isNextjs) {
      network.uis = [
        {
          name: 'web',
          buildCommand: 'npm run build',
          outputDir: 'dist',
        },
      ];
    }

    if (needsDatabase) {
      network.sql = [
        {
          name: 'db',
          databaseVersion: 'POSTGRES_15',
          tier: 'db-f1-micro',
        },
      ];
    }

    if (needsRedis) {
      network.redis = [
        {
          name: 'cache',
          tier: 'BASIC',
          memorySizeGb: 1,
        },
      ];
    }

    if (needsStorage) {
      project.buckets = [
        {
          name: 'my-app-uploads',
          location: 'US',
        },
      ];
    }

    // Add load balancer if multiple backends
    const hasContainers = !!network.containers;
    const hasFunctions = !!network.functions;
    const hasUis = !!network.uis;
    const backendCount =
      (hasContainers ? 1 : 0) + (hasFunctions ? 1 : 0) + (hasUis ? 1 : 0);

    if (backendCount > 0) {
      const routes: { path: string; backend: string }[] = [];

      if (hasContainers) {
        const containerName = (network.containers as Record<string, unknown>[])[0]
          .name as string;
        if (containerName === 'api') {
          routes.push({ path: '/api/*', backend: 'api' });
        } else {
          routes.push({ path: '/*', backend: containerName });
        }
      }

      if (hasFunctions) {
        routes.push({ path: '/api/*', backend: 'api' });
      }

      if (hasUis) {
        routes.push({ path: '/*', backend: 'web' });
      }

      if (routes.length > 0) {
        network.loadBalancer = {
          name: 'gateway',
          routes,
        };
      }
    }

    suggestion += '```json\n' + JSON.stringify(config, null, 2) + '\n```\n\n';

    suggestion += '## Next Steps\n\n';
    suggestion += '1. Replace `YOUR_GCP_PROJECT_ID` with your actual GCP project ID\n';
    suggestion += '2. Save this as `.stacksolo/stacksolo.config.json`\n';
    suggestion += '3. Run `stacksolo scaffold` to generate boilerplate\n';
    suggestion += '4. Write your application code\n';
    suggestion += '5. Run `stacksolo deploy`\n';

    if (needsFirebase) {
      suggestion += '\n## Firebase Auth Setup\n\n';
      suggestion += '1. Enable Firebase in your GCP project\n';
      suggestion += '2. Set up Firebase Auth methods (email, Google, etc.)\n';
      suggestion += '3. Use `kernel.authMiddleware()` from `@stacksolo/runtime` in your API\n';
    }

    return {
      content: [{ type: 'text', text: suggestion }],
    };
  },
};
