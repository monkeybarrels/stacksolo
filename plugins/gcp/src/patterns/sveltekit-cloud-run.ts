import { defineAppPattern, type InfrastructureSpec } from '@stacksolo/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export const sveltekitCloudRun = defineAppPattern({
  id: 'sveltekit-cloud-run',
  name: 'SvelteKit on Cloud Run',
  description: 'Deploy a SvelteKit application to Cloud Run with optional Cloud SQL database',
  icon: 'web',
  provider: 'gcp',

  detect: async (projectPath: string): Promise<boolean> => {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      // Check for @sveltejs/kit in dependencies or devDependencies
      const hasSvelteKit = !!(
        pkg.dependencies?.['@sveltejs/kit'] ||
        pkg.devDependencies?.['@sveltejs/kit']
      );

      return hasSvelteKit;
    } catch {
      return false;
    }
  },

  prompts: [
    {
      id: 'needsDatabase',
      type: 'boolean',
      label: 'Add Cloud SQL database?',
      description: 'Include a managed PostgreSQL database for your app',
      default: false,
    },
    {
      id: 'databaseType',
      type: 'select',
      label: 'Database Version',
      description: 'PostgreSQL version to use',
      options: [
        { value: 'POSTGRES_15', label: 'PostgreSQL 15 (recommended)' },
        { value: 'POSTGRES_14', label: 'PostgreSQL 14' },
        { value: 'POSTGRES_13', label: 'PostgreSQL 13' },
      ],
      default: 'POSTGRES_15',
    },
    {
      id: 'memory',
      type: 'select',
      label: 'Container Memory',
      description: 'Memory allocated to each Cloud Run instance',
      options: [
        { value: '256Mi', label: '256 MB' },
        { value: '512Mi', label: '512 MB' },
        { value: '1Gi', label: '1 GB' },
      ],
      default: '256Mi',
    },
    {
      id: 'adapter',
      type: 'select',
      label: 'SvelteKit Adapter',
      description: 'Which adapter is configured in svelte.config.js',
      options: [
        { value: 'node', label: 'adapter-node (recommended for Cloud Run)' },
        { value: 'auto', label: 'adapter-auto' },
      ],
      default: 'node',
    },
  ],

  infrastructure: (answers): InfrastructureSpec[] => {
    const infra: InfrastructureSpec[] = [
      {
        type: 'gcp:artifact_registry',
        name: 'app-registry',
        config: {
          format: 'DOCKER',
          description: 'Container registry for SvelteKit app',
        },
      },
      {
        type: 'gcp:cloud_run',
        name: 'app',
        config: {
          memory: answers.memory || '256Mi',
          minInstances: 0,
          maxInstances: 10,
          port: 3000,
          allowUnauthenticated: true,
        },
      },
    ];

    if (answers.needsDatabase) {
      infra.push({
        type: 'gcp:cloud_sql',
        name: 'db',
        config: {
          databaseVersion: answers.databaseType || 'POSTGRES_15',
          tier: 'db-f1-micro',
          databaseName: 'app',
          enablePublicIp: false,
        },
      });
    }

    return infra;
  },

  build: {
    generateDockerfile: async (projectPath: string): Promise<string> => {
      // Check if using adapter-node by looking at svelte.config.js
      let usesAdapterNode = false;
      try {
        const configPaths = [
          path.join(projectPath, 'svelte.config.js'),
          path.join(projectPath, 'svelte.config.ts'),
        ];

        for (const configPath of configPaths) {
          try {
            const content = await fs.readFile(configPath, 'utf-8');
            if (content.includes('adapter-node') || content.includes('@sveltejs/adapter-node')) {
              usesAdapterNode = true;
              break;
            }
          } catch {
            // File doesn't exist, continue
          }
        }
      } catch {
        // Ignore errors, assume adapter-node
        usesAdapterNode = true;
      }

      if (usesAdapterNode) {
        // Optimized Dockerfile for adapter-node (produces build/ directory)
        return `# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy built application
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

EXPOSE 3000
CMD ["node", "build"]`;
      }

      // Fallback for other adapters - build and serve with preview
      return `# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy everything needed to run
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]`;
    },

    preBuildCommands: ['npm run check || true', 'npm run lint || true'],
  },

  env: (resources) => {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      ORIGIN: resources.app?.outputs?.url || '',
    };

    // Add database connection string if database resource exists
    if (resources.db?.outputs?.connectionString) {
      env.DATABASE_URL = resources.db.outputs.connectionString;
    }

    return env;
  },
});
