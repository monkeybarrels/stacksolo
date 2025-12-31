/**
 * Project templates for StackSolo
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { StackSoloConfig } from '@stacksolo/blueprint';

export type ProjectType = 'function-api' | 'container-api' | 'function-cron' | 'static-api' | 'ui-api' | 'ui-only';
export type UIFramework = 'react' | 'vue' | 'sveltekit' | 'html';

export interface TemplateOptions {
  projectName: string;
  gcpProjectId: string;
  region: string;
  projectType: ProjectType;
  uiFramework?: UIFramework;
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
              sourceDir: './functions/api',
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
              sourceDir: './containers/api',
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
              sourceDir: './functions/worker',
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
              sourceDir: './containers/web',
              port: 3000,
              memory: '256Mi',
            },
          ],
          functions: [
            {
              name: 'api',
              sourceDir: './functions/api',
              runtime: 'nodejs20',
              entryPoint: 'handler',
              memory: '256Mi',
            },
          ],
        },
      ];
      break;

    case 'ui-api':
      // Static UI (Cloud Storage + CDN) + API (Cloud Function)
      baseConfig.project.backend = 'cdktf';
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
          functions: [
            {
              name: 'api',
              sourceDir: './functions/api',
              runtime: 'nodejs20',
              entryPoint: 'handler',
              memory: '256Mi',
              timeout: 60,
            },
          ],
          uis: [
            {
              name: 'web',
              sourceDir: './apps/web',
              framework: options.uiFramework || 'react',
            },
          ],
        },
      ];
      break;

    case 'ui-only':
      // Static UI only (Cloud Storage + CDN)
      baseConfig.project.backend = 'cdktf';
      baseConfig.project.networks = [
        {
          name: 'main',
          loadBalancer: {
            name: `${projectName}-lb`,
            routes: [{ path: '/*', backend: 'web' }],
          },
          uis: [
            {
              name: 'web',
              sourceDir: './apps/web',
              framework: options.uiFramework || 'react',
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
export async function scaffoldTemplates(
  cwd: string,
  projectType: ProjectType,
  uiFramework?: UIFramework
): Promise<string[]> {
  const files: string[] = [];

  switch (projectType) {
    case 'function-api':
      files.push(...(await scaffoldFunctionApi(cwd, 'functions/api')));
      break;

    case 'container-api':
      files.push(...(await scaffoldContainerApi(cwd, 'containers/api')));
      break;

    case 'function-cron':
      files.push(...(await scaffoldFunctionCron(cwd, 'functions/worker')));
      break;

    case 'static-api':
      files.push(...(await scaffoldFunctionApi(cwd, 'functions/api')));
      files.push(...(await scaffoldStaticWeb(cwd, 'containers/web')));
      break;

    case 'ui-api':
      files.push(...(await scaffoldFunctionApi(cwd, 'functions/api')));
      files.push(...(await scaffoldUI(cwd, 'apps/web', uiFramework || 'react')));
      break;

    case 'ui-only':
      files.push(...(await scaffoldUI(cwd, 'apps/web', uiFramework || 'react')));
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

/**
 * Scaffold UI based on framework
 */
async function scaffoldUI(cwd: string, name: string, framework: UIFramework): Promise<string[]> {
  switch (framework) {
    case 'react':
      return scaffoldReactUI(cwd, name);
    case 'vue':
      return scaffoldVueUI(cwd, name);
    case 'sveltekit':
      return scaffoldSvelteKitUI(cwd, name);
    case 'html':
      return scaffoldHTMLUI(cwd, name);
    default:
      return scaffoldReactUI(cwd, name);
  }
}

async function scaffoldReactUI(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'tsc && vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
        devDependencies: {
          '@types/react': '^18.2.0',
          '@types/react-dom': '^18.2.0',
          '@vitejs/plugin-react': '^4.2.0',
          typescript: '^5.0.0',
          vite: '^5.0.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // vite.config.ts
  await fs.writeFile(
    path.join(dir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
`
  );

  // tsconfig.json
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ['src'],
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
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  );

  // src/main.tsx
  await fs.writeFile(
    path.join(dir, 'src', 'main.tsx'),
    `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
  );

  // src/App.tsx
  await fs.writeFile(
    path.join(dir, 'src', 'App.tsx'),
    `import { useState } from 'react';

function App() {
  const [data, setData] = useState<unknown>(null);

  const callApi = async () => {
    const res = await fetch('/api/');
    const json = await res.json();
    setData(json);
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Hello, World!</h1>
      <button onClick={callApi}>Call API</button>
      {data && (
        <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: 4, marginTop: '1rem' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default App;
`
  );

  // src/index.css
  await fs.writeFile(
    path.join(dir, 'src', 'index.css'),
    `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
}

button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
`
  );

  return [
    `${name}/package.json`,
    `${name}/vite.config.ts`,
    `${name}/tsconfig.json`,
    `${name}/index.html`,
    `${name}/src/main.tsx`,
    `${name}/src/App.tsx`,
    `${name}/src/index.css`,
  ];
}

async function scaffoldVueUI(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vue-tsc && vite build',
          preview: 'vite preview',
        },
        dependencies: {
          vue: '^3.4.0',
        },
        devDependencies: {
          '@vitejs/plugin-vue': '^5.0.0',
          typescript: '^5.0.0',
          vite: '^5.0.0',
          'vue-tsc': '^2.0.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // vite.config.ts
  await fs.writeFile(
    path.join(dir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
`
  );

  // tsconfig.json
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          module: 'ESNext',
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'preserve',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue'],
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
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
  );

  // src/main.ts
  await fs.writeFile(
    path.join(dir, 'src', 'main.ts'),
    `import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');
`
  );

  // src/App.vue
  await fs.writeFile(
    path.join(dir, 'src', 'App.vue'),
    `<script setup lang="ts">
import { ref } from 'vue';

const data = ref<unknown>(null);

async function callApi() {
  const res = await fetch('/api/');
  data.value = await res.json();
}
</script>

<template>
  <div class="container">
    <h1>Hello, World!</h1>
    <button @click="callApi">Call API</button>
    <pre v-if="data" class="result">{{ JSON.stringify(data, null, 2) }}</pre>
  </div>
</template>

<style scoped>
.container {
  font-family: system-ui, sans-serif;
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.result {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}
</style>
`
  );

  // src/style.css
  await fs.writeFile(
    path.join(dir, 'src', 'style.css'),
    `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
}

button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}
`
  );

  // src/vite-env.d.ts
  await fs.writeFile(
    path.join(dir, 'src', 'vite-env.d.ts'),
    `/// <reference types="vite/client" />
`
  );

  return [
    `${name}/package.json`,
    `${name}/vite.config.ts`,
    `${name}/tsconfig.json`,
    `${name}/index.html`,
    `${name}/src/main.ts`,
    `${name}/src/App.vue`,
    `${name}/src/style.css`,
    `${name}/src/vite-env.d.ts`,
  ];
}

async function scaffoldSvelteKitUI(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(path.join(dir, 'src', 'routes'), { recursive: true });

  // package.json
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        type: 'module',
        scripts: {
          dev: 'vite dev',
          build: 'vite build',
          preview: 'vite preview',
        },
        devDependencies: {
          '@sveltejs/adapter-static': '^3.0.0',
          '@sveltejs/kit': '^2.0.0',
          '@sveltejs/vite-plugin-svelte': '^3.0.0',
          svelte: '^4.2.0',
          typescript: '^5.0.0',
          vite: '^5.0.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  // svelte.config.js
  await fs.writeFile(
    path.join(dir, 'svelte.config.js'),
    `import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
  },
};
`
  );

  // vite.config.ts
  await fs.writeFile(
    path.join(dir, 'vite.config.ts'),
    `import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
});
`
  );

  // tsconfig.json
  await fs.writeFile(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: './.svelte-kit/tsconfig.json',
        compilerOptions: {
          strict: true,
        },
      },
      null,
      2
    ) + '\n'
  );

  // src/app.html
  await fs.writeFile(
    path.join(dir, 'src', 'app.html'),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body>
    <div>%sveltekit.body%</div>
  </body>
</html>
`
  );

  // src/routes/+page.svelte
  await fs.writeFile(
    path.join(dir, 'src', 'routes', '+page.svelte'),
    `<script lang="ts">
  let data: unknown = null;

  async function callApi() {
    const res = await fetch('/api/');
    data = await res.json();
  }
</script>

<div class="container">
  <h1>Hello, World!</h1>
  <button on:click={callApi}>Call API</button>
  {#if data}
    <pre class="result">{JSON.stringify(data, null, 2)}</pre>
  {/if}
</div>

<style>
  .container {
    font-family: system-ui, sans-serif;
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
  }
  .result {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    margin-top: 1rem;
  }
  button {
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
</style>
`
  );

  // src/routes/+layout.ts (for static prerendering)
  await fs.writeFile(
    path.join(dir, 'src', 'routes', '+layout.ts'),
    `export const prerender = true;
export const ssr = false;
`
  );

  return [
    `${name}/package.json`,
    `${name}/svelte.config.js`,
    `${name}/vite.config.ts`,
    `${name}/tsconfig.json`,
    `${name}/src/app.html`,
    `${name}/src/routes/+page.svelte`,
    `${name}/src/routes/+layout.ts`,
  ];
}

async function scaffoldHTMLUI(cwd: string, name: string): Promise<string[]> {
  const dir = path.join(cwd, name);
  await fs.mkdir(dir, { recursive: true });

  // index.html
  await fs.writeFile(
    path.join(dir, 'index.html'),
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>Hello, World!</h1>
    <button onclick="callApi()">Call API</button>
    <pre id="result"></pre>
  </div>
  <script src="script.js"></script>
</body>
</html>
`
  );

  // styles.css
  await fs.writeFile(
    path.join(dir, 'styles.css'),
    `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
}

.container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}

button {
  padding: 0.5rem 1rem;
  cursor: pointer;
}

#result {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
  display: none;
}

#result:not(:empty) {
  display: block;
}
`
  );

  // script.js
  await fs.writeFile(
    path.join(dir, 'script.js'),
    `async function callApi() {
  const res = await fetch('/api/');
  const data = await res.json();
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
}
`
  );

  return [`${name}/index.html`, `${name}/styles.css`, `${name}/script.js`];
}
