/**
 * API client for CLI to communicate with StackSolo API
 *
 * The CLI can work in two modes:
 * 1. Connected mode: API server running (desktop app or `stacksolo serve`)
 * 2. Standalone mode: Direct operations (future)
 */

const API_BASE = process.env.STACKSOLO_API_URL || 'http://localhost:4000';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface TrpcResponse<T> {
  result?: { data: T };
  error?: { message: string };
}

async function callApi<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const json = await response.json() as TrpcResponse<T>;

    // tRPC wraps responses in { result: { data: ... } }
    if (json.result?.data !== undefined) {
      return { success: true, data: json.result.data };
    }

    if (json.error) {
      return { success: false, error: json.error.message };
    }

    return { success: true, data: json as unknown as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// tRPC-style API calls
export const api = {
  projects: {
    list: () => callApi<Project[]>('/trpc/projects.list'),
    get: (id: string) => callApi<Project>(`/trpc/projects.get?input=${encodeURIComponent(JSON.stringify({ id }))}`),
    create: (data: CreateProjectInput) =>
      callApi<Project>('/trpc/projects.create', 'POST', data),
  },
  patterns: {
    list: () => callApi<PatternInfo[]>('/trpc/patterns.list'),
    detect: (path: string) =>
      callApi<PatternInfo[]>(`/trpc/patterns.detect?input=${encodeURIComponent(JSON.stringify({ path }))}`),
  },
  deployments: {
    deploy: (projectId: string) =>
      callApi<Deployment>('/trpc/deployments.deploy', 'POST', { projectId }),
    build: (projectId: string) =>
      callApi<Deployment>('/trpc/deployments.build', 'POST', { projectId }),
    destroy: (projectId: string) =>
      callApi<Deployment>('/trpc/deployments.destroy', 'POST', { projectId }),
    status: (projectId: string) =>
      callApi<Deployment>(`/trpc/deployments.status?input=${encodeURIComponent(JSON.stringify({ projectId }))}`),
    generateConfig: (projectId: string, resourceOutputs?: Record<string, Record<string, string>>) =>
      callApi<{ envPath: string; configPath: string }>(
        '/trpc/deployments.generateConfig',
        'POST',
        { projectId, resourceOutputs }
      ),
  },
};

// Types (should match @stacksolo/shared)
interface Project {
  id: string;
  name: string;
  provider: string;
  providerConfig: Record<string, unknown>;
  patternId?: string;
  path?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateProjectInput {
  name: string;
  provider: string;
  providerConfig: Record<string, unknown>;
  patternId?: string;
  path?: string;
}

interface PatternInfo {
  id: string;
  name: string;
  description: string;
  framework: string;
  confidence?: number;
}

interface Deployment {
  id: string;
  projectId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string;
  logs?: string;
  error?: string;
}

export async function checkApiConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
