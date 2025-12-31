/**
 * Project templates for StackSolo
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { StackSoloConfig } from '@stacksolo/blueprint';

export type ProjectType = 'function-api' | 'container-api' | 'function-cron' | 'static-api';

export interface TemplateOptions {
  projectName: string;
  gcpProjectId: string;
  region: string;
  projectType: ProjectType;
  needsDatabase?: boolean;
  databaseVersion?: string;
  needsCache?: boolean;
  needsBucket?: boolean;
}

export interface StateFile {
  version: number;
  initialized: string;
  lastDeploy: string | null;
  gcpProjectId: string;
  orgPolicyFixed: boolean;
  apisEnabled: string[];
}

/**
 * Generate config based on project type
 */
export function generateConfig(options: TemplateOptions): StackSoloConfig {
  const { projectName, gcpProjectId, region, projectType, needsDatabase, databaseVersion, needsBucket } = options;

  const baseConfig: StackSoloConfig = {
    project: {
      name: projectName,
      gcpProjectId,
      region,
    },
  };

  // Add buckets if needed
  if (needsBucket) {
    baseConfig.project.buckets = [
      {
        name: `${projectName}-uploads`,
      },
    ];
  }

  // Build network config based on project type
  switch (projectType) {
    case 'function-api':
      baseConfig.project.networks = [
        {
          name: 'main',
          loadBalancer: {
            name: `${projectName}-lb`,
            routes: [{ path: '/*', backend: 'api' }],
          },
          functions: [
            {
              name: 'api',
              sourceDir: './api',
              runtime: 'nodejs20',
              entryPoint: 'handler',
              memory: '256Mi',
              timeout: 60,
            },
          ],
          ...(needsDatabase && databaseVersion
            ? {
                databases: [
                  {
                    name: 'db',
                    databaseVersion,
                    tier: 'db-f1-micro',
                  },
                ],
              }
            : {}),
        },
      ];
      break;

    case 'container-api':
      baseConfig.project.networks = [
        {
          name: 'main',
          loadBalancer: {
            name: `${projectName}-lb`,
            routes: [{ path: '/*', backend: 'api' }],
          },
          containers: [
            {
              name: 'api',
              sourceDir: './api',
              port: 8080,
              memory: '512Mi',
            },
          ],
          ...(needsDatabase && databaseVersion
            ? {
                databases: [
                  {
                    name: 'db',
                    databaseVersion,
                    tier: 'db-f1-micro',
                  },
                ],
              }
            : {}),
        },
      ];
      break;

    case 'function-cron':
      baseConfig.project.crons = [
        {
          name: 'daily-job',
          schedule: '0 0 * * *',
          timezone: 'UTC',
          target: 'main/worker',
        },
      ];
      baseConfig.project.networks = [
        {
          name: 'main',
          functions: [
            {
              name: 'worker',
              sourceDir: './worker',
              runtime: 'nodejs20',
              entryPoint: 'handler',
              memory: '512Mi',
              timeout: 540,
            },
          ],
        },
      ];
      break;

    case 'static-api':
      baseConfig.project.networks = [
        {
          name: 'main',
          loadBalancer: {
            name: `${projectName}-lb`,
            routes: [
              { path: '/api/*', backend: 'api' },
              { path: '/*', backend: 'web' },
            ],
          },
          containers: [
            {
              name: 'web',
              sourceDir: './web',
              port: 3000,
              memory: '256Mi',
            },
          ],
          functions: [
            {
              name: 'api',
              sourceDir: './api',
              runtime: 'nodejs20',
              entryPoint: 'handler',
              memory: '256Mi',
            },
          ],
        },
      ];
      break;
  }

  return baseConfig;
}

/**
 * Create .stacksolo directory and state file
 */
export async function createStacksoloDir(
  cwd: string,
  options: {
    gcpProjectId: string;
    orgPolicyFixed: boolean;
    apisEnabled: string[];
  }
): Promise<void> {
  const stacksoloDir = path.join(cwd, '.stacksolo');
  await fs.mkdir(stacksoloDir, { recursive: true });

  const state: StateFile = {
    version: 1,
    initialized: new Date().toISOString(),
    lastDeploy: null,
    gcpProjectId: options.gcpProjectId,
    orgPolicyFixed: options.orgPolicyFixed,
    apisEnabled: options.apisEnabled,
  };

  await fs.writeFile(path.join(stacksoloDir, 'state.json'), JSON.stringify(state, null, 2) + '\n');

  // Add .stacksolo to .gitignore if it exists
  const gitignorePath = path.join(cwd, '.gitignore');
  try {
    const gitignore = await fs.readFile(gitignorePath, 'utf-8');
    if (!gitignore.includes('.stacksolo/')) {
      await fs.appendFile(gitignorePath, '\n# StackSolo local state\n.stacksolo/\n');
    }
  } catch {
    // .gitignore doesn't exist, create it
    await fs.writeFile(gitignorePath, '# StackSolo local state\n.stacksolo/\n');
  }
}

/**
 * Create config file
 */
export async function createConfigFile(cwd: string, config: StackSoloConfig): Promise<void> {
  const configPath = path.join(cwd, '.stacksolo', 'stacksolo.config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Scaffold code templates based on project type
 */
export async function scaffoldTemplates(cwd: string, projectType: ProjectType): Promise<string[]> {
  const files: string[] = [];

  switch (projectType) {
    case 'function-api':
      files.push(...(await scaffoldFunctionApi(cwd, 'api')));
      break;

    case 'container-api':
      files.push(...(await scaffoldContainerApi(cwd, 'api')));
      break;

    case 'function-cron':
      files.push(...(await scaffoldFunctionCron(cwd, 'worker')));
      break;

    case 'static-api':
      files.push(...(await scaffoldFunctionApi(cwd, 'api')));
      files.push(...(await scaffoldStaticWeb(cwd, 'web')));
      break;
  }

  return files;
}

async function scaffoldFunctionApi(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(dir, { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        main: 'index.js',
        type: 'module',
        scripts: {
          start: 'npx functions-framework --target=handler',
          build: 'tsc',
        },
        dependencies: {
          '@google-cloud/functions-framework': '^3.3.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // index.ts
  await fs.writeFile(
    path.join(dir, 'index.ts'),
    `import functions from '@google-cloud/functions-framework';

functions.http('handler', (req, res) => {
  const { method, path } = req;

  // Health check
  if (path === '/health') {
    return res.json({ status: 'ok' });
  }

  // Your API routes here
  res.json({
    message: 'Hello from StackSolo!',
    method,
    path,
  });
});
`
  );

  // tsconfig.json
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          outDir: 'dist',
          declaration: true,
        },
        include: ['*.ts'],
      },
      null,
      2
    ) + '\n'
  );

  return [`${name}/package.json`, `${name}/index.ts`, `${name}/tsconfig.json`];
}

async function scaffoldContainerApi(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(dir, { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        main: 'index.js',
        type: 'module',
        scripts: {
          start: 'node index.js',
          build: 'tsc',
        },
        dependencies: {
          express: '^4.18.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
          '@types/express': '^4.17.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // index.ts
  await fs.writeFile(
    path.join(dir, 'index.ts'),
    `import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Hello from StackSolo!' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(\`Server listening on port \${port}\`);
});
`
  );

  // tsconfig.json
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          outDir: 'dist',
          declaration: true,
        },
        include: ['*.ts'],
      },
      null,
      2
    ) + '\n'
  );

  // Dockerfile
  await fs.writeFile(
    path.join(dir, 'Dockerfile'),
    `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
`
  );

  return [`${name}/package.json`, `${name}/index.ts`, `${name}/tsconfig.json`, `${name}/Dockerfile`];
}

async function scaffoldFunctionCron(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(dir, { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        main: 'index.js',
        type: 'module',
        scripts: {
          start: 'npx functions-framework --target=handler',
          build: 'tsc',
        },
        dependencies: {
          '@google-cloud/functions-framework': '^3.3.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // index.ts
  await fs.writeFile(
    path.join(dir, 'index.ts'),
    `import functions from '@google-cloud/functions-framework';

functions.http('handler', (req, res) => {
  console.log('Cron triggered:', new Date().toISOString());

  // Your scheduled job logic here

  console.log('Job complete');
  res.json({ status: 'ok' });
});
`
  );

  // tsconfig.json
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          outDir: 'dist',
          declaration: true,
        },
        include: ['*.ts'],
      },
      null,
      2
    ) + '\n'
  );

  return [`${name}/package.json`, `${name}/index.ts`, `${name}/tsconfig.json`];
}

async function scaffoldStaticWeb(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(dir, { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        devDependencies: {
          vite: '^5.0.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // index.html
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    #result { background: #f5f5f5; padding: 1rem; border-radius: 4px; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>Hello, World!</h1>
  <button onclick="callApi()">Call API</button>
  <pre id="result"></pre>
  <script>
    async function callApi() {
      const res = await fetch('/api/');
      const data = await res.json();
      document.getElementById('result').textContent = JSON.stringify(data, null, 2);
    }
  </script>
</body>
</html>
`
  );

  // Dockerfile
  await fs.writeFile(
    path.join(dir, 'Dockerfile'),
    `FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
`
  );

  return [`${name}/package.json`, `${name}/index.html`, `${name}/Dockerfile`];
}
