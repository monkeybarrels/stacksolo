/**
 * Remote Template Service
 *
 * Fetches and applies templates from the stacksolo-architectures repository.
 * Templates are full project scaffolds with source code (React/Vue apps with auth, etc.)
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// GitHub repository configuration
const TEMPLATES_REPO = 'monkeybarrels/stacksolo-architectures';
const TEMPLATES_BRANCH = 'main';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${TEMPLATES_REPO}/${TEMPLATES_BRANCH}`;
const GITHUB_API_BASE = `https://api.github.com/repos/${TEMPLATES_REPO}/contents`;

// Simple in-memory cache (15 minute TTL)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000;

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
 * GitHub API file entry
 */
interface GitHubFileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

/**
 * Fetch raw content from GitHub
 */
async function fetchRaw(urlPath: string): Promise<string> {
  const url = `${GITHUB_RAW_BASE}/${urlPath}`;
  const cacheKey = `raw:${url}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as string;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const data = await response.text();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Fetch JSON from GitHub
 */
async function fetchJson<T>(urlPath: string): Promise<T> {
  const content = await fetchRaw(urlPath);
  return JSON.parse(content) as T;
}

/**
 * Fetch directory listing from GitHub API
 */
async function fetchDirListing(dirPath: string): Promise<GitHubFileEntry[]> {
  const url = `${GITHUB_API_BASE}/${dirPath}?ref=${TEMPLATES_BRANCH}`;
  const cacheKey = `api:${url}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as GitHubFileEntry[];
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'stacksolo-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch directory listing: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GitHubFileEntry[];
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Recursively fetch all files from a directory
 */
async function fetchFilesRecursive(
  dirPath: string,
  basePath: string = ''
): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await fetchDirListing(dirPath);

  for (const entry of entries) {
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.type === 'dir') {
      const subFiles = await fetchFilesRecursive(entry.path, relativePath);
      for (const [subPath, content] of subFiles) {
        files.set(subPath, content);
      }
    } else if (entry.type === 'file' && entry.download_url) {
      const content = await fetchFileContent(entry.download_url);
      files.set(relativePath, content);
    }
  }

  return files;
}

/**
 * Fetch file content from download URL
 */
async function fetchFileContent(downloadUrl: string): Promise<string> {
  const cacheKey = `file:${downloadUrl}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as string;
  }

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }

  const data = await response.text();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * List all available templates
 */
export async function listTemplates(): Promise<TemplateInfo[]> {
  try {
    const manifest = await fetchJson<TemplateManifest>('templates.json');
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
    return await fetchJson<TemplateMetadata>(`${template.path}/template.json`);
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
    return await fetchJson<Record<string, unknown>>(`${template.path}/config.json`);
  } catch {
    return null;
  }
}

/**
 * Fetch all files for a template variant
 */
export async function fetchTemplateFiles(
  templateId: string,
  variantId: string
): Promise<Map<string, string>> {
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

  const filesPath = `${template.path}/${variant.filesDir}`;
  return await fetchFilesRecursive(filesPath);
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
 * Substitute variables in content
 * Pattern: {{variableName}}
 */
function substituteVariables(content: string, variables: TemplateVariables): string {
  let result = content;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, String(value));
  }

  return result;
}

/**
 * Apply template to target directory
 */
export async function applyTemplate(
  targetDir: string,
  files: Map<string, string>,
  variables: TemplateVariables
): Promise<string[]> {
  const createdFiles: string[] = [];

  for (const [relativePath, content] of files) {
    const targetPath = path.join(targetDir, relativePath);
    const dir = path.dirname(targetPath);

    // Create directory if needed
    await fs.mkdir(dir, { recursive: true });

    // Substitute variables and write file
    const processedContent = substituteVariables(content, variables);
    await fs.writeFile(targetPath, processedContent, 'utf-8');

    createdFiles.push(relativePath);
  }

  return createdFiles;
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

  // Fetch template files
  const files = await fetchTemplateFiles(templateId, variantId);
  log(`Downloaded ${files.size} files`);

  // Apply template config
  log('Creating configuration...');
  await applyTemplateConfig(targetDir, templateId, variables);

  // Apply template files
  log('Writing template files...');
  const createdFiles = await applyTemplate(targetDir, files, variables);

  return {
    configCreated: true,
    filesCreated: createdFiles,
  };
}
