/**
 * Remote Template Service
 *
 * Fetches and applies templates from the stacksolo-architectures repository.
 * Templates are full project scaffolds with source code (React/Vue apps with auth, etc.)
 *
 * Uses the unified GitHub service for all remote operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  fetchRaw,
  fetchJson,
  downloadDirectory,
  substituteVariables,
  substituteVariablesInDirectory,
  parseRepo,
  type RepoConfig,
} from './github.service';

// GitHub repository configuration
const REPO = parseRepo('monkeybarrels/stacksolo-architectures', 'main');

/**
 * Template manifest structure (templates.json)
 */
export interface TemplateManifest {
  version: string;
  templates: TemplateInfo[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  path: string;
  variants?: string[];
}

/**
 * Template metadata (template.json in each template folder)
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  variables: TemplateVariable[];
  variants: TemplateVariant[];
  dependencies?: string[];
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'boolean' | 'select';
  default?: string;
  required?: boolean;
  options?: string[];
}

export interface TemplateVariant {
  id: string;
  name: string;
  description: string;
  filesDir: string;
}

/**
 * List all available templates
 */
export async function listTemplates(): Promise<TemplateInfo[]> {
  try {
    const manifest = await fetchJson<TemplateManifest>('templates.json', REPO);
    return manifest.templates;
  } catch (error) {
    // If templates.json doesn't exist yet, return empty array
    if (error instanceof Error && error.message.includes('404')) {
      return [];
    }
    throw error;
  }
}

/**
 * Get template metadata
 */
export async function getTemplateMetadata(templateId: string): Promise<TemplateMetadata | null> {
  const templates = await listTemplates();
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    return null;
  }

  try {
    return await fetchJson<TemplateMetadata>(`${template.path}/template.json`, REPO);
  } catch {
    return null;
  }
}

/**
 * Fetch template config.json (stacksolo.config.json template)
 */
export async function getTemplateConfig(templateId: string): Promise<Record<string, unknown> | null> {
  const templates = await listTemplates();
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    return null;
  }

  try {
    return await fetchJson<Record<string, unknown>>(`${template.path}/config.json`, REPO);
  } catch {
    return null;
  }
}

/**
 * Variable substitution options
 */
export interface TemplateVariables {
  projectName: string;
  gcpProjectId: string;
  region: string;
  [key: string]: string | boolean;
}

/**
 * Apply template config to target directory
 */
export async function applyTemplateConfig(
  targetDir: string,
  templateId: string,
  variables: TemplateVariables
): Promise<void> {
  const config = await getTemplateConfig(templateId);

  if (!config) {
    throw new Error(`Template config not found: ${templateId}`);
  }

  // Substitute variables in the config
  const configStr = JSON.stringify(config, null, 2);
  const processedConfig = substituteVariables(configStr, variables);

  // Write to .stacksolo/stacksolo.config.json
  const stacksoloDir = path.join(targetDir, '.stacksolo');
  await fs.mkdir(stacksoloDir, { recursive: true });

  const configPath = path.join(stacksoloDir, 'stacksolo.config.json');
  await fs.writeFile(configPath, processedConfig, 'utf-8');
}

/**
 * Check if a template ID refers to a remote template
 * (as opposed to a built-in project type)
 */
export function isRemoteTemplate(templateId: string): boolean {
  const builtInTypes = [
    'function-api',
    'container-api',
    'ui-api',
    'ui-only',
    'function-cron',
    'static-api',
  ];

  return !builtInTypes.includes(templateId);
}

/**
 * Full template application workflow
 * Uses tarball download for efficiency
 */
export async function initFromTemplate(
  targetDir: string,
  templateId: string,
  variantId: string,
  variables: TemplateVariables,
  onProgress?: (message: string) => void
): Promise<{ configCreated: boolean; filesCreated: string[] }> {
  const log = onProgress || (() => {});

  log(`Fetching template: ${templateId}...`);

  // Get template info
  const templates = await listTemplates();
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    throw new Error(`Template not found: ${templateId}`);
  }

  const metadata = await getTemplateMetadata(templateId);
  if (!metadata) {
    throw new Error(`Template metadata not found: ${templateId}`);
  }

  const variant = metadata.variants.find((v) => v.id === variantId);
  if (!variant) {
    throw new Error(`Variant not found: ${variantId}`);
  }

  // Download the variant files directory using tarball
  const filesPath = `${template.path}/${variant.filesDir}`;
  log('Downloading template files...');

  await downloadDirectory(filesPath, targetDir, REPO, {
    onProgress: log,
  });

  // Apply variable substitutions to all downloaded files
  log('Applying variable substitutions...');
  await substituteVariablesInDirectory(targetDir, variables);

  // Apply template config
  log('Creating configuration...');
  await applyTemplateConfig(targetDir, templateId, variables);

  // Get list of created files
  const createdFiles = await listFilesRecursive(targetDir);

  return {
    configCreated: true,
    filesCreated: createdFiles,
  };
}

/**
 * List all files in a directory recursively
 */
async function listFilesRecursive(dir: string, basePath: string = ''): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const subFiles = await listFilesRecursive(path.join(dir, entry.name), relativePath);
      files.push(...subFiles);
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

// Re-export for convenience
export { substituteVariables } from './github.service';
