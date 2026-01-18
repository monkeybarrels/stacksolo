/**
 * Micro-Template Service
 *
 * Fetches and applies micro-templates from the stacksolo-architectures repository.
 * Micro-templates are single-purpose components (functions or UIs) that can be
 * added to existing projects in a mix-and-match fashion.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import {
  fetchJson,
  downloadDirectory,
  substituteVariablesInDirectory,
  parseRepo,
} from './github.service';

// GitHub repository configuration
const REPO = parseRepo('monkeybarrels/stacksolo-architectures', 'main');

/**
 * Micro-template manifest structure (micro-templates.json)
 */
export interface MicroTemplateManifest {
  version: string;
  microTemplates: MicroTemplateInfo[];
}

export interface MicroTemplateInfo {
  id: string;
  name: string;
  type: 'function' | 'ui' | 'shell' | 'feature';
  description: string;
  tags: string[];
  path: string;
}

/**
 * Micro-template metadata (template.json in each micro-template folder)
 */
export interface MicroTemplateMetadata {
  id: string;
  name: string;
  type: 'function' | 'ui' | 'shell' | 'feature';
  description: string;
  variables: MicroTemplateVariable[];
  secrets: string[];
  dependencies: Record<string, string>;
  config: MicroTemplateConfig;
  feature?: FeatureTemplateConfig;
  postInstall?: string[];
}

/**
 * Feature template configuration (for type: 'feature')
 */
export interface FeatureTemplateConfig {
  sourceDir: string;
  targetDir: string;
  shellUpdates: {
    packageJson: string;
    routerImport: string;
    routerSpread: string;
  };
}

export interface MicroTemplateVariable {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
}

export interface MicroTemplateConfig {
  function?: {
    name: string;
    runtime: string;
    entryPoint: string;
    memory?: string;
    sourceDir?: string;
    env?: Record<string, string>;
    trigger?: {
      type: 'http' | 'pubsub' | 'storage';
      topic?: string;
      bucket?: string;
    };
  };
  ui?: {
    name: string;
    framework: string;
    sourceDir?: string;
  };
}

/**
 * List all available micro-templates
 */
export async function listMicroTemplates(): Promise<MicroTemplateInfo[]> {
  try {
    const manifest = await fetchJson<MicroTemplateManifest>('micro-templates.json', REPO);
    return manifest.microTemplates;
  } catch (error) {
    // If micro-templates.json doesn't exist yet, return empty array
    if (error instanceof Error && error.message.includes('404')) {
      return [];
    }
    throw error;
  }
}

/**
 * Get micro-template metadata
 */
export async function getMicroTemplateMetadata(microTemplateId: string): Promise<MicroTemplateMetadata | null> {
  const templates = await listMicroTemplates();
  const template = templates.find((t) => t.id === microTemplateId);

  if (!template) {
    return null;
  }

  try {
    return await fetchJson<MicroTemplateMetadata>(`${template.path}/template.json`, REPO);
  } catch {
    return null;
  }
}

/**
 * Download and apply micro-template files to target directory
 */
export async function applyMicroTemplate(
  targetDir: string,
  microTemplateId: string,
  variables: Record<string, string>,
  namePrefix?: string,
  onProgress?: (message: string) => void
): Promise<{ filesAdded: string[]; configFragment: MicroTemplateConfig }> {
  const log = onProgress || (() => {});

  // Get micro-template info
  const templates = await listMicroTemplates();
  const template = templates.find((t) => t.id === microTemplateId);

  if (!template) {
    throw new Error(`Micro-template not found: ${microTemplateId}`);
  }

  const metadata = await getMicroTemplateMetadata(microTemplateId);
  if (!metadata) {
    throw new Error(`Micro-template metadata not found: ${microTemplateId}`);
  }

  const filesAdded: string[] = [];

  // Download to temp directory first
  const tempDir = path.join(targetDir, '.stacksolo-micro-temp-' + Date.now());

  try {
    log('Downloading micro-template files...');
    await downloadDirectory(`${template.path}/files`, tempDir, REPO, {
      onProgress: log,
    });

    // Apply variable substitutions
    log('Applying variable substitutions...');
    await substituteVariablesInDirectory(tempDir, variables);

    // Copy files to appropriate locations based on type
    if (metadata.config.function) {
      const fnConfig = metadata.config.function;
      const sourceName = fnConfig.name;
      const targetName = namePrefix ? `${namePrefix}-${sourceName}` : sourceName;

      const sourcePath = path.join(tempDir, 'functions', sourceName);
      const targetPath = path.join(targetDir, 'functions', targetName);

      if (existsSync(sourcePath)) {
        if (existsSync(targetPath)) {
          log(`Skipping functions/${targetName}/ (already exists)`);
        } else {
          log(`Copying functions/${targetName}/...`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await copyDirectoryRecursive(sourcePath, targetPath);
          filesAdded.push(`functions/${targetName}/`);
        }
      }
    }

    if (metadata.config.ui) {
      const uiConfig = metadata.config.ui;
      const sourceName = uiConfig.name;
      const targetName = namePrefix ? `${namePrefix}-${sourceName}` : sourceName;

      const sourcePath = path.join(tempDir, 'apps', sourceName);
      const targetPath = path.join(targetDir, 'apps', targetName);

      if (existsSync(sourcePath)) {
        if (existsSync(targetPath)) {
          log(`Skipping apps/${targetName}/ (already exists)`);
        } else {
          log(`Copying apps/${targetName}/...`);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await copyDirectoryRecursive(sourcePath, targetPath);
          filesAdded.push(`apps/${targetName}/`);
        }
      }
    }
  } finally {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  // Update config fragment with prefix if provided
  const configFragment = applyPrefixToConfig(metadata.config, namePrefix);

  return { filesAdded, configFragment };
}

/**
 * Apply name prefix to config fragment
 */
function applyPrefixToConfig(config: MicroTemplateConfig, prefix?: string): MicroTemplateConfig {
  if (!prefix) return config;

  const result: MicroTemplateConfig = {};

  if (config.function) {
    result.function = {
      ...config.function,
      name: `${prefix}-${config.function.name}`,
    };
    if (result.function.sourceDir) {
      result.function.sourceDir = result.function.sourceDir.replace(
        config.function.name,
        result.function.name
      );
    }
  }

  if (config.ui) {
    result.ui = {
      ...config.ui,
      name: `${prefix}-${config.ui.name}`,
    };
    if (result.ui.sourceDir) {
      result.ui.sourceDir = result.ui.sourceDir.replace(config.ui.name, result.ui.name);
    }
  }

  return result;
}

/**
 * Recursively copy a directory
 */
async function copyDirectoryRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Apply a feature template to an existing app-shell monorepo
 *
 * This handles type: 'feature' templates which:
 * 1. Copy feature package to packages/feature-{name}/
 * 2. Update shell's package.json with the new dependency
 * 3. Update shell's router to import and spread the feature routes
 */
export async function applyFeatureTemplate(
  targetDir: string,
  microTemplateId: string,
  variables: Record<string, string>,
  onProgress?: (message: string) => void
): Promise<{ filesAdded: string[]; shellUpdated: boolean }> {
  const log = onProgress || (() => {});

  // Get micro-template info
  const templates = await listMicroTemplates();
  const template = templates.find((t) => t.id === microTemplateId);

  if (!template) {
    throw new Error(`Feature template not found: ${microTemplateId}`);
  }

  if (template.type !== 'feature') {
    throw new Error(`Template ${microTemplateId} is not a feature template`);
  }

  const metadata = await getMicroTemplateMetadata(microTemplateId);
  if (!metadata || !metadata.feature) {
    throw new Error(`Feature template metadata not found: ${microTemplateId}`);
  }

  const filesAdded: string[] = [];
  let shellUpdated = false;

  // Substitute variables in feature config
  const featureConfig = metadata.feature;
  const targetFeatureDir = substituteVariablesInString(featureConfig.targetDir, variables);

  // Download to temp directory first
  const tempDir = path.join(targetDir, '.stacksolo-feature-temp-' + Date.now());

  try {
    log('Downloading feature template files...');
    await downloadDirectory(`${template.path}/files`, tempDir, REPO, {
      onProgress: log,
    });

    // Apply variable substitutions to all files
    log('Applying variable substitutions...');
    await substituteVariablesInDirectory(tempDir, variables);

    // Copy feature package to target location
    const sourcePath = path.join(tempDir, featureConfig.sourceDir);
    const targetPath = path.join(targetDir, targetFeatureDir);

    if (existsSync(sourcePath)) {
      if (existsSync(targetPath)) {
        log(`Skipping ${targetFeatureDir}/ (already exists)`);
      } else {
        log(`Copying ${targetFeatureDir}/...`);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await copyDirectoryRecursive(sourcePath, targetPath);
        filesAdded.push(`${targetFeatureDir}/`);
      }
    } else {
      throw new Error(`Feature source directory not found: ${featureConfig.sourceDir}`);
    }

    // Update shell package.json
    const shellPackageJsonPath = path.join(targetDir, 'packages/shell/package.json');
    if (existsSync(shellPackageJsonPath)) {
      log('Updating shell package.json...');
      const updated = await updateShellPackageJson(
        shellPackageJsonPath,
        featureConfig.shellUpdates.packageJson,
        variables
      );
      if (updated) {
        shellUpdated = true;
        log('Added dependency to shell package.json');
      }
    }

    // Update shell router
    const shellRouterPath = path.join(targetDir, 'packages/shell/src/core/router/index.ts');
    if (existsSync(shellRouterPath)) {
      log('Updating shell router...');
      const updated = await updateShellRouter(
        shellRouterPath,
        featureConfig.shellUpdates.routerImport,
        featureConfig.shellUpdates.routerSpread,
        variables
      );
      if (updated) {
        shellUpdated = true;
        log('Added feature routes to shell router');
      }
    }
  } finally {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  return { filesAdded, shellUpdated };
}

/**
 * Substitute variables in a string using {{variableName}} pattern
 */
function substituteVariablesInString(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
}

/**
 * Update shell's package.json to add feature dependency
 */
async function updateShellPackageJson(
  packageJsonPath: string,
  dependencyPattern: string,
  variables: Record<string, string>
): Promise<boolean> {
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(content);

  // Parse the dependency pattern (e.g., "@{{org}}/feature-{{name}}: workspace:*")
  const substituted = substituteVariablesInString(dependencyPattern, variables);
  // Split on first ': ' to handle 'workspace:*' correctly
  const colonIndex = substituted.indexOf(': ');
  const depName = substituted.substring(0, colonIndex).trim();
  const depVersion = substituted.substring(colonIndex + 2).trim();

  if (!packageJson.dependencies) {
    packageJson.dependencies = {};
  }

  // Check if already exists
  if (packageJson.dependencies[depName]) {
    return false;
  }

  // Add the dependency
  packageJson.dependencies[depName] = depVersion;

  // Sort dependencies alphabetically
  const sortedDeps: Record<string, string> = {};
  for (const key of Object.keys(packageJson.dependencies).sort()) {
    sortedDeps[key] = packageJson.dependencies[key];
  }
  packageJson.dependencies = sortedDeps;

  await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  return true;
}

/**
 * Update shell's router to import and use feature routes
 */
async function updateShellRouter(
  routerPath: string,
  importPattern: string,
  spreadPattern: string,
  variables: Record<string, string>
): Promise<boolean> {
  let content = await fs.readFile(routerPath, 'utf-8');

  const importLine = substituteVariablesInString(importPattern, variables);
  const spreadLine = substituteVariablesInString(spreadPattern, variables);

  // Check if already imported
  if (content.includes(importLine)) {
    return false;
  }

  // Find the last import statement from a feature package
  // Pattern: import { routes as xxxRoutes } from '@org/feature-xxx';
  const importRegex = /^import \{ routes as \w+Routes \} from ['"]@[\w-]+\/feature-[\w-]+['"];?\s*$/gm;
  const imports = content.match(importRegex);

  if (imports && imports.length > 0) {
    // Insert after the last feature import
    const lastImport = imports[imports.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);
    const insertPos = lastImportIndex + lastImport.length;

    content = content.slice(0, insertPos) + '\n' + importLine + content.slice(insertPos);
  } else {
    // Insert after the feature-dashboard import or any feature import
    // Look for a marker comment or the featureRoutes array
    const featureRoutesMatch = content.match(/const featureRoutes[^=]*=\s*\[/);
    if (featureRoutesMatch) {
      // Insert import before the featureRoutes declaration
      const featureRoutesIndex = content.indexOf(featureRoutesMatch[0]);
      // Find a good place to insert - after existing imports
      const lastImportMatch = content.slice(0, featureRoutesIndex).match(/^import .+$/gm);
      if (lastImportMatch) {
        const lastImportStr = lastImportMatch[lastImportMatch.length - 1];
        const lastImportIdx = content.lastIndexOf(lastImportStr, featureRoutesIndex);
        const insertPos = lastImportIdx + lastImportStr.length;
        content = content.slice(0, insertPos) + '\n' + importLine + content.slice(insertPos);
      }
    }
  }

  // Add the spread to featureRoutes array
  // Look for pattern: const featureRoutes = [ ...xxxRoutes, ]
  const spreadRegex = /(\.\.\.\w+Routes,?\s*)+/;
  const featureRoutesArrayMatch = content.match(/const featureRoutes[^=]*=\s*\[([\s\S]*?)\];/);

  if (featureRoutesArrayMatch) {
    const arrayContent = featureRoutesArrayMatch[1];

    // Check if already has this spread
    if (arrayContent.includes(spreadLine.replace(',', ''))) {
      // Already present, just update imports
      await fs.writeFile(routerPath, content);
      return true;
    }

    // Find the last spread in the array and add after it
    const spreadsMatch = arrayContent.match(/\.\.\.\w+Routes,?\s*/g);
    if (spreadsMatch) {
      const lastSpread = spreadsMatch[spreadsMatch.length - 1];
      const lastSpreadIndex = content.indexOf(lastSpread, content.indexOf(featureRoutesArrayMatch[0]));
      const insertPos = lastSpreadIndex + lastSpread.length;

      // Add newline and proper formatting
      const newSpread = spreadLine.endsWith(',') ? spreadLine : spreadLine + ',';
      content = content.slice(0, insertPos) + '\n  ' + newSpread + content.slice(insertPos);
    } else {
      // No spreads yet, add after the opening bracket
      const arrayStart = content.indexOf('[', content.indexOf(featureRoutesArrayMatch[0]));
      const newSpread = spreadLine.endsWith(',') ? spreadLine : spreadLine + ',';
      content = content.slice(0, arrayStart + 1) + '\n  ' + newSpread + content.slice(arrayStart + 1);
    }
  }

  await fs.writeFile(routerPath, content);
  return true;
}

/**
 * Check if an ID refers to a micro-template (as opposed to a full template)
 */
export async function isMicroTemplate(id: string): Promise<boolean> {
  const microTemplates = await listMicroTemplates();
  return microTemplates.some((t) => t.id === id);
}

/**
 * Check if an ID refers to a feature template
 */
export async function isFeatureTemplate(id: string): Promise<boolean> {
  const microTemplates = await listMicroTemplates();
  const template = microTemplates.find((t) => t.id === id);
  return template?.type === 'feature';
}

/**
 * Check if an ID refers to a shell template
 */
export async function isShellTemplate(id: string): Promise<boolean> {
  const microTemplates = await listMicroTemplates();
  const template = microTemplates.find((t) => t.id === id);
  return template?.type === 'shell';
}
