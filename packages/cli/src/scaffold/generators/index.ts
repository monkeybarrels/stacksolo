/**
 * Scaffold generators orchestrator
 * Coordinates generation of env files, docker-compose, and service directories
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { StackSoloConfig } from '@stacksolo/blueprint';
import { generateEnvFiles } from './env.js';
import { generateDockerCompose } from './docker-compose.js';
import { generateServiceScaffolds } from './services.js';
import type { ScaffoldOptions, ScaffoldResult, GeneratedFile } from './types.js';

export { generateEnvFiles } from './env.js';
export { generateDockerCompose } from './docker-compose.js';
export { generateServiceScaffolds } from './services.js';
export type { ScaffoldOptions, ScaffoldResult, GeneratedFile } from './types.js';

/**
 * Generate all scaffold files from config
 */
export function generateScaffold(
  config: StackSoloConfig,
  options: Partial<ScaffoldOptions> = {}
): ScaffoldResult {
  const files: GeneratedFile[] = [];
  const warnings: string[] = [];
  let envVarCount = 0;
  let dockerServiceCount = 0;
  let serviceDirectoryCount = 0;

  const generateEnv = !options.dockerOnly && !options.servicesOnly;
  const generateDocker = !options.envOnly && !options.servicesOnly;
  const generateServices = !options.envOnly && !options.dockerOnly;

  // Generate environment files
  if (generateEnv) {
    const envResult = generateEnvFiles(config);
    files.push(envResult.envLocal);
    files.push(envResult.envExample);
    files.push(envResult.envTs);
    // Count variables by parsing the content
    const envLocalLines = envResult.envLocal.content.split('\n');
    envVarCount = envLocalLines.filter((line) => line.includes('=') && !line.startsWith('#')).length;
  }

  // Generate docker-compose
  if (generateDocker) {
    const dockerResult = generateDockerCompose(config);
    if (dockerResult.dockerCompose) {
      files.push(dockerResult.dockerCompose);
      dockerServiceCount = dockerResult.services.length;
    }
  }

  // Generate service scaffolds
  if (generateServices) {
    const servicesResult = generateServiceScaffolds(config);
    files.push(...servicesResult.files);
    serviceDirectoryCount = servicesResult.services.length;
  }

  return {
    files,
    warnings,
    summary: {
      envVars: envVarCount,
      dockerServices: dockerServiceCount,
      serviceDirectories: serviceDirectoryCount,
    },
  };
}

/**
 * Write scaffold files to disk
 */
export async function writeScaffoldFiles(
  files: GeneratedFile[],
  targetDir: string,
  force: boolean = false
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const fullPath = path.join(targetDir, file.path);
    const dir = path.dirname(fullPath);

    // Create directory if needed
    await fs.mkdir(dir, { recursive: true });

    // Check if file exists
    const exists = await fs.stat(fullPath).then(() => true).catch(() => false);

    if (exists && !force) {
      skipped.push(file.path);
      continue;
    }

    await fs.writeFile(fullPath, file.content);
    written.push(file.path);
  }

  return { written, skipped };
}

/**
 * Create local storage directories for buckets
 */
export async function createLocalStorageDirs(
  config: StackSoloConfig,
  targetDir: string
): Promise<string[]> {
  const created: string[] = [];

  for (const bucket of config.project.buckets || []) {
    const storagePath = path.join(targetDir, 'local-storage', bucket.name);
    await fs.mkdir(storagePath, { recursive: true });

    // Create .gitkeep to track empty directory
    await fs.writeFile(path.join(storagePath, '.gitkeep'), '');
    created.push(`local-storage/${bucket.name}`);
  }

  return created;
}

/**
 * Update .gitignore with scaffold entries
 */
export async function updateGitignore(targetDir: string): Promise<void> {
  const gitignorePath = path.join(targetDir, '.gitignore');
  const entriesToAdd = [
    '',
    '# StackSolo local development',
    '.env.local',
    'local-storage/',
    '',
  ];

  let content = '';
  try {
    content = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // File doesn't exist, create new
  }

  // Check if already has stacksolo entries
  if (content.includes('# StackSolo local development')) {
    return;
  }

  content = content.trimEnd() + '\n' + entriesToAdd.join('\n');
  await fs.writeFile(gitignorePath, content);
}
