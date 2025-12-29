import { defineAppPattern, type InfrastructureSpec } from '@stacksolo/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export const nextjsCloudRun = defineAppPattern({
  id: 'nextjs-cloud-run',
  name: 'Next.js on Cloud Run',
  description: 'Deploy a Next.js application to Cloud Run with optional Cloud SQL database',
  icon: 'web',
  provider: 'gcp',

  detect: async (projectPath: string): Promise<boolean> => {
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      return !!(pkg.dependencies?.next || pkg.devDependencies?.next);
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
        { value: '512Mi', label: '512 MB' },
        { value: '1Gi', label: '1 GB' },
        { value: '2Gi', label: '2 GB' },
      ],
      default: '512Mi',
    },
  ],

  infrastructure: (answers): InfrastructureSpec[] => {
    const infra: InfrastructureSpec[] = [
      {
        type: 'gcp:artifact_registry',
        name: 'app-registry',
        config: {
          format: 'DOCKER',
          description: 'Container registry for Next.js app',
        },
      },
      {
        type: 'gcp:cloud_run',
        name: 'app',
        config: {
          memory: answers.memory || '512Mi',
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
      // Check if next.config exists and has standalone output
      let hasStandalone = false;
      try {
        const configPaths = [
          path.join(projectPath, 'next.config.js'),
          path.join(projectPath, 'next.config.mjs'),
          path.join(projectPath, 'next.config.ts'),
        ];

        for (const configPath of configPaths) {
          try {
            const content = await fs.readFile(configPath, 'utf-8');
            if (content.includes('standalone')) {
              hasStandalone = true;
              break;
            }
          } catch {
            // File doesn't exist, continue
          }
        }
      } catch {
        // Ignore errors
      }

      if (hasStandalone) {
        // Optimized Dockerfile for standalone output
        return `# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]`;
      }

      // Standard Dockerfile (when standalone is not configured)
      return `# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]`;
    },

    preBuildCommands: ['npm run lint || true', 'npm run type-check || true'],
  },

  env: (resources) => {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
    };

    // Add database connection string if database resource exists
    if (resources.db?.outputs?.connectionString) {
      env.DATABASE_URL = resources.db.outputs.connectionString;
    }

    return env;
  },
});
