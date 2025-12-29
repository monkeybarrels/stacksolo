/**
 * Project scaffolding for StackSolo
 *
 * Creates a simple React + Cloud Function project structure.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface ScaffoldOptions {
  projectName: string;
  targetDir: string;
  gcpProject: string;
  region: string;
}

export interface ScaffoldResult {
  files: string[];
  instructions: string[];
  patternId: string;
}

/**
 * Check if a directory is empty (or only contains hidden files)
 */
export async function isDirectoryEmpty(dir: string): Promise<boolean> {
  try {
    const files = await fs.readdir(dir);
    const significantFiles = files.filter(
      (f) => !f.startsWith('.') && f !== 'node_modules' && f !== '.git'
    );
    return significantFiles.length === 0;
  } catch {
    return true;
  }
}

/**
 * Scaffold a React + Cloud Function project
 *
 * Structure:
 *   /web     - React app (Vite)
 *   /api     - Cloud Function
 */
export async function scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { projectName, targetDir } = options;
  const files: string[] = [];

  // Root package.json
  await writeFile(targetDir, 'package.json', JSON.stringify({
    name: projectName,
    private: true,
    scripts: {
      dev: 'concurrently "npm run dev:web" "npm run dev:api"',
      'dev:web': 'cd web && npm run dev',
      'dev:api': 'cd api && npm run dev',
      build: 'npm run build:web && npm run build:api',
      'build:web': 'cd web && npm run build',
      'build:api': 'cd api && npm run build',
    },
    devDependencies: {
      concurrently: '^8.0.0',
    },
  }, null, 2));
  files.push('package.json');

  // Create directories
  await fs.mkdir(path.join(targetDir, 'web', 'src'), { recursive: true });
  await fs.mkdir(path.join(targetDir, 'api', 'src'), { recursive: true });

  // ============ WEB (React + Vite) ============

  await writeFile(targetDir, 'web/package.json', JSON.stringify({
    name: `${projectName}-web`,
    private: true,
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
      '@vitejs/plugin-react': '^4.0.0',
      typescript: '^5.0.0',
      vite: '^5.0.0',
    },
  }, null, 2));
  files.push('web/package.json');

  await writeFile(targetDir, 'web/vite.config.ts', `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\\/api/, ''),
      },
    },
  },
});
`);
  files.push('web/vite.config.ts');

  await writeFile(targetDir, 'web/tsconfig.json', JSON.stringify({
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
    },
    include: ['src'],
  }, null, 2));
  files.push('web/tsconfig.json');

  await writeFile(targetDir, 'web/index.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);
  files.push('web/index.html');

  await writeFile(targetDir, 'web/src/main.tsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`);
  files.push('web/src/main.tsx');

  await writeFile(targetDir, 'web/src/App.tsx', `import { useState, useEffect } from 'react';

export default function App() {
  const [message, setMessage] = useState('Loading...');

  useEffect(() => {
    fetch('/api/hello')
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage('Start the API: npm run dev:api'));
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>${projectName}</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>{message}</p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <a
          href="https://stacksolo.dev"
          style={{
            padding: '0.5rem 1rem',
            background: '#0066ff',
            color: 'white',
            borderRadius: '4px',
            textDecoration: 'none',
          }}
        >
          StackSolo Docs
        </a>
      </div>
    </div>
  );
}
`);
  files.push('web/src/App.tsx');

  await writeFile(targetDir, 'web/src/vite-env.d.ts', `/// <reference types="vite/client" />
`);
  files.push('web/src/vite-env.d.ts');

  // ============ API (Cloud Function) ============

  await writeFile(targetDir, 'api/package.json', JSON.stringify({
    name: `${projectName}-api`,
    main: 'dist/index.js',
    scripts: {
      dev: 'npm run build && npx @google-cloud/functions-framework --target=api --port=8080',
      build: 'tsc',
      watch: 'tsc --watch',
    },
    dependencies: {
      '@google-cloud/functions-framework': '^3.0.0',
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      typescript: '^5.0.0',
    },
  }, null, 2));
  files.push('api/package.json');

  await writeFile(targetDir, 'api/tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ['src'],
  }, null, 2));
  files.push('api/tsconfig.json');

  await writeFile(targetDir, 'api/src/index.ts', `import { http } from '@google-cloud/functions-framework';

http('api', (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  const path = req.path;

  // GET /hello
  if (path === '/hello') {
    res.json({ message: 'Hello from Cloud Functions!' });
    return;
  }

  // GET /health
  if (path === '/health') {
    res.json({ status: 'ok' });
    return;
  }

  res.status(404).json({ error: 'Not found' });
});
`);
  files.push('api/src/index.ts');

  // ============ Root files ============

  await writeFile(targetDir, '.gitignore', `node_modules
dist
.next
.env
.env.local
.stacksolo
.DS_Store
`);
  files.push('.gitignore');

  await writeFile(targetDir, 'README.md', `# ${projectName}

React frontend + Cloud Function API, built with StackSolo.

## Structure

\`\`\`
├── web/     # React app (Vite)
├── api/     # Cloud Function
\`\`\`

## Development

\`\`\`bash
# Install dependencies
npm install
cd web && npm install
cd ../api && npm install
cd ..

# Run both web and api
npm run dev
\`\`\`

- Web: http://localhost:3000
- API: http://localhost:8080

## Deploy

\`\`\`bash
stacksolo deploy
\`\`\`
`);
  files.push('README.md');

  return {
    files,
    instructions: [
      'npm install && cd web && npm install && cd ../api && npm install && cd ..',
      'npm run dev',
      'stacksolo deploy',
    ],
    patternId: 'react-functions',
  };
}

// Legacy export for backwards compatibility
export async function scaffoldNextjsCloudRun(options: ScaffoldOptions): Promise<ScaffoldResult> {
  return scaffoldProject(options);
}

async function writeFile(baseDir: string, filePath: string, content: string): Promise<void> {
  const fullPath = path.join(baseDir, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}
