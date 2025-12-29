import { defineAppPattern, type InfrastructureSpec } from '@stacksolo/core';
import * as fs from 'fs/promises';
import * as path from 'path';

export const reactFunctions = defineAppPattern({
  id: 'react-functions',
  name: 'React + Cloud Functions',
  description: 'Static React frontend with Cloud Function API backend',
  icon: 'web',
  provider: 'gcp',

  detect: async (projectPath: string): Promise<boolean> => {
    try {
      // Check for web/package.json with react and api/package.json with functions-framework
      const webPkgPath = path.join(projectPath, 'web', 'package.json');
      const apiPkgPath = path.join(projectPath, 'api', 'package.json');

      const [webExists, apiExists] = await Promise.all([
        fs.access(webPkgPath).then(() => true).catch(() => false),
        fs.access(apiPkgPath).then(() => true).catch(() => false),
      ]);

      if (!webExists || !apiExists) return false;

      const webPkg = JSON.parse(await fs.readFile(webPkgPath, 'utf-8'));
      const apiPkg = JSON.parse(await fs.readFile(apiPkgPath, 'utf-8'));

      const hasReact = !!(webPkg.dependencies?.react || webPkg.devDependencies?.react);
      const hasFunctions = !!(
        apiPkg.dependencies?.['@google-cloud/functions-framework'] ||
        apiPkg.devDependencies?.['@google-cloud/functions-framework']
      );

      return hasReact && hasFunctions;
    } catch {
      return false;
    }
  },

  prompts: [
    {
      id: 'memory',
      type: 'select',
      label: 'Cloud Function Memory',
      description: 'Memory allocated to the function',
      options: [
        { value: '256Mi', label: '256 MB' },
        { value: '512Mi', label: '512 MB' },
        { value: '1Gi', label: '1 GB' },
      ],
      default: '256Mi',
    },
  ],

  infrastructure: (answers): InfrastructureSpec[] => {
    return [
      {
        type: 'gcp:storage_bucket',
        name: 'frontend',
        config: {
          website: {
            mainPageSuffix: 'index.html',
            notFoundPage: 'index.html',
          },
          uniformBucketLevelAccess: true,
        },
      },
      {
        type: 'gcp:cloud_function',
        name: 'api',
        config: {
          runtime: 'nodejs20',
          entryPoint: 'api',
          memory: answers.memory || '256Mi',
          sourceDir: 'api',
          allowUnauthenticated: true,
        },
      },
    ];
  },

  build: {
    generateDockerfile: async (): Promise<string> => {
      // Cloud Functions don't need a Dockerfile - they deploy from source
      return '';
    },
    preBuildCommands: [
      'cd web && npm run build',
      'cd api && npm run build',
    ],
  },

  env: (resources) => {
    const env: Record<string, string> = {};

    if (resources.api?.outputs?.url) {
      env.VITE_API_URL = resources.api.outputs.url;
    }

    return env;
  },
});
