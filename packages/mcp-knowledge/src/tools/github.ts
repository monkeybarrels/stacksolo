/**
 * GitHub Utilities
 *
 * Shared utilities for fetching from the stacksolo-architectures repository.
 * Provides unified access to templates, stacks, and architectures.
 */

// GitHub repository configuration
const REPO_OWNER = 'monkeybarrels';
const REPO_NAME = 'stacksolo-architectures';
const REPO_BRANCH = 'main';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}`;

// Simple in-memory cache for GitHub fetches (15 minute TTL)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch raw content from GitHub
 */
export async function fetchFromGitHub(path: string): Promise<unknown> {
  const url = `${GITHUB_RAW_BASE}/${path}`;
  const cacheKey = url;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let data: unknown;

  if (path.endsWith('.json') || contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Cache the result
  cache.set(cacheKey, { data, timestamp: Date.now() });

  return data;
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
 * Template manifest structure (templates.json)
 */
export interface TemplateManifest {
  version: string;
  templates: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    difficulty: string;
    path: string;
  }>;
}

/**
 * Stacks manifest structure (stacks.json)
 */
export interface StacksManifest {
  version: string;
  stacks: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    difficulty: string;
    path: string;
  }>;
}

/**
 * Architecture manifest structure (index.json)
 */
export interface ArchitectureManifest {
  version: string;
  architectures: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    path: string;
    community?: boolean;
  }>;
}

/**
 * Stack detail from stack.json
 */
export interface StackMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  difficulty: string;
  variables: Record<string, {
    description: string;
    required?: boolean;
    default?: string;
  }>;
}
