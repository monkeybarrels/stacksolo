/**
 * GitHub Utilities
 *
 * Shared utilities for fetching from GitHub repositories.
 */

// GitHub architectures repository configuration
const ARCHITECTURES_REPO = 'monkeybarrels/stacksolo-architectures';
const ARCHITECTURES_BRANCH = 'main';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${ARCHITECTURES_REPO}/${ARCHITECTURES_BRANCH}`;

// Simple in-memory cache for GitHub fetches (15 minute TTL)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

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
