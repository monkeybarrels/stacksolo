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
  type: 'function' | 'ui';
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
  type: 'function' | 'ui';
  description: string;
  variables: MicroTemplateVariable[];
  secrets: string[];
  dependencies: Record<string, string>;
  config: MicroTemplateConfig;
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
 * Check if an ID refers to a micro-template (as opposed to a full template)
 */
export async function isMicroTemplate(id: string): Promise<boolean> {
  const microTemplates = await listMicroTemplates();
  return microTemplates.some((t) => t.id === id);
}
