/**
 * Unified GitHub Service
 *
 * A single, consistent approach for fetching content from GitHub repositories.
 * Used by templates, stacks, and architectures.
 *
 * Strategy:
 * - For indexes/metadata: Raw file fetch (fast, no API rate limits)
 * - For full directories: Tarball download + selective extraction (single HTTP request)
 * - Unified caching with configurable TTL
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';

// Default repository configuration
const DEFAULT_REPO = 'monkeybarrels/stacksolo-architectures';
const DEFAULT_BRANCH = 'main';

// Cache configuration
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Repository configuration
 */
export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Parse a repo string into owner/repo/branch
 */
export function parseRepo(repoStr: string = DEFAULT_REPO, branch: string = DEFAULT_BRANCH): RepoConfig {
  const parts = repoStr.split('/');
  return {
    owner: parts[0],
    repo: parts[1],
    branch,
  };
}

/**
 * Get raw GitHub URL for a file
 */
function getRawUrl(repo: RepoConfig, filePath: string): string {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${repo.branch}/${filePath}`;
}

/**
 * Get tarball URL for a repository
 */
function getTarballUrl(repo: RepoConfig): string {
  return `https://github.com/${repo.owner}/${repo.repo}/archive/refs/heads/${repo.branch}.tar.gz`;
}

/**
 * Fetch raw content from GitHub (for single files)
 */
export async function fetchRaw(
  filePath: string,
  repo: RepoConfig = parseRepo()
): Promise<string> {
  const url = getRawUrl(repo, filePath);
  const cacheKey = `raw:${url}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as string;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${response.status} ${response.statusText}`);
  }

  const data = await response.text();
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

/**
 * Fetch JSON from GitHub
 */
export async function fetchJson<T>(
  filePath: string,
  repo: RepoConfig = parseRepo()
): Promise<T> {
  const content = await fetchRaw(filePath, repo);
  return JSON.parse(content) as T;
}

/**
 * Check if a file exists in the repository
 */
export async function fileExists(
  filePath: string,
  repo: RepoConfig = parseRepo()
): Promise<boolean> {
  try {
    const url = getRawUrl(repo, filePath);
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Exclude patterns for directory downloads
 */
const DEFAULT_EXCLUDE_PATTERNS = ['node_modules', '.git', 'dist', '.DS_Store', '__pycache__', '.pyc'];

/**
 * Download and extract a directory from the repository
 * Uses tarball download for efficiency (single HTTP request)
 */
export async function downloadDirectory(
  dirPath: string,
  outputDir: string,
  repo: RepoConfig = parseRepo(),
  options: {
    excludePatterns?: string[];
    onProgress?: (message: string) => void;
  } = {}
): Promise<boolean> {
  const { excludePatterns = DEFAULT_EXCLUDE_PATTERNS, onProgress } = options;
  const log = onProgress || (() => {});

  const tempDir = path.join(os.tmpdir(), `stacksolo-${Date.now()}`);
  const tarballUrl = getTarballUrl(repo);

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Download tarball
    log('Downloading...');
    const tarballPath = path.join(tempDir, 'repo.tar.gz');
    const response = await fetch(tarballUrl);

    if (!response.ok) {
      throw new Error(`Failed to download tarball: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tarballPath, buffer);

    // Extract tarball
    log('Extracting...');
    await runCommand('tar', ['-xzf', tarballPath, '-C', tempDir], tempDir);

    // Find the extracted directory (named {repo}-{branch})
    const extractedRoot = path.join(tempDir, `${repo.repo}-${repo.branch}`);
    const sourceDir = path.join(extractedRoot, dirPath);

    // Check if the directory exists
    try {
      await fs.access(sourceDir);
    } catch {
      throw new Error(`Directory "${dirPath}" not found in repository`);
    }

    // Copy files to output directory
    log('Copying files...');
    await copyDirectory(sourceDir, outputDir, excludePatterns);

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });

    return true;
  } catch (error) {
    // Clean up on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Download multiple directories from the repository (more efficient than multiple calls)
 */
export async function downloadDirectories(
  dirPaths: string[],
  outputDirs: string[],
  repo: RepoConfig = parseRepo(),
  options: {
    excludePatterns?: string[];
    onProgress?: (message: string) => void;
  } = {}
): Promise<Map<string, boolean>> {
  if (dirPaths.length !== outputDirs.length) {
    throw new Error('dirPaths and outputDirs must have the same length');
  }

  const { excludePatterns = DEFAULT_EXCLUDE_PATTERNS, onProgress } = options;
  const log = onProgress || (() => {});
  const results = new Map<string, boolean>();

  const tempDir = path.join(os.tmpdir(), `stacksolo-${Date.now()}`);
  const tarballUrl = getTarballUrl(repo);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Download tarball once
    log('Downloading repository...');
    const tarballPath = path.join(tempDir, 'repo.tar.gz');
    const response = await fetch(tarballUrl);

    if (!response.ok) {
      throw new Error(`Failed to download tarball: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tarballPath, buffer);

    // Extract once
    log('Extracting...');
    await runCommand('tar', ['-xzf', tarballPath, '-C', tempDir], tempDir);

    const extractedRoot = path.join(tempDir, `${repo.repo}-${repo.branch}`);

    // Copy each directory
    for (let i = 0; i < dirPaths.length; i++) {
      const dirPath = dirPaths[i];
      const outputDir = outputDirs[i];
      const sourceDir = path.join(extractedRoot, dirPath);

      try {
        await fs.access(sourceDir);
        log(`Copying ${dirPath}...`);
        await copyDirectory(sourceDir, outputDir, excludePatterns);
        results.set(dirPath, true);
      } catch {
        results.set(dirPath, false);
      }
    }

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });

    return results;
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Run a shell command
 */
function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Copy directory recursively, excluding specified patterns
 */
async function copyDirectory(
  srcDir: string,
  destDir: string,
  excludePatterns: string[]
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip excluded patterns
    if (excludePatterns.some((p) => entry.name === p || entry.name.startsWith(p + '/'))) {
      continue;
    }

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, excludePatterns);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Variable substitution in content
 * Pattern: {{variableName}}
 */
export function substituteVariables(
  content: string,
  variables: Record<string, string | boolean | number>
): string {
  let result = content;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, String(value));
  }

  return result;
}

/**
 * Apply variable substitution to all files in a directory
 */
export async function substituteVariablesInDirectory(
  dirPath: string,
  variables: Record<string, string | boolean | number>,
  fileExtensions: string[] = ['.json', '.ts', '.js', '.md', '.yaml', '.yml', '.html', '.css']
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await substituteVariablesInDirectory(fullPath, variables, fileExtensions);
    } else if (fileExtensions.some((ext) => entry.name.endsWith(ext))) {
      const content = await fs.readFile(fullPath, 'utf-8');
      const substituted = substituteVariables(content, variables);
      if (content !== substituted) {
        await fs.writeFile(fullPath, substituted, 'utf-8');
      }
    }
  }
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  cache.clear();
}

// ============================================================================
// Index Types - Unified structure for templates, stacks, and architectures
// ============================================================================

/**
 * Base metadata for all repository content types
 */
export interface ContentMetadata {
  id: string;
  name: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  path: string;
}

/**
 * Template metadata (full source code scaffolds)
 */
export interface TemplateMetadata extends ContentMetadata {
  variants?: string[];
  framework?: string;
}

/**
 * Stack metadata (complete deployable applications)
 */
export interface StackMetadata extends ContentMetadata {
  version: string;
  variables: Record<
    string,
    {
      description: string;
      required?: boolean;
      default?: string;
    }
  >;
}

/**
 * Architecture metadata (config-only patterns)
 */
export interface ArchitectureMetadata extends ContentMetadata {
  community?: boolean;
}

/**
 * Index file structure
 */
export interface ContentIndex<T extends ContentMetadata> {
  version: string;
  lastUpdated?: string;
  items: T[];
}

/**
 * Fetch an index file
 */
export async function fetchIndex<T extends ContentMetadata>(
  indexPath: string,
  repo: RepoConfig = parseRepo()
): Promise<ContentIndex<T>> {
  return fetchJson<ContentIndex<T>>(indexPath, repo);
}

/**
 * List items from an index with optional filtering
 */
export async function listFromIndex<T extends ContentMetadata>(
  indexPath: string,
  filters?: {
    tag?: string;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
  },
  repo: RepoConfig = parseRepo()
): Promise<T[]> {
  const index = await fetchIndex<T>(indexPath, repo);
  let items = index.items;

  if (filters?.tag) {
    items = items.filter((item) =>
      item.tags.some((t) => t.toLowerCase().includes(filters.tag!.toLowerCase()))
    );
  }

  if (filters?.difficulty) {
    items = items.filter((item) => item.difficulty === filters.difficulty);
  }

  return items;
}
