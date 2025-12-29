/**
 * Simple HTTP client for calling the StackSolo API
 *
 * The MCP server connects to the StackSolo API which can be running:
 * 1. As part of the Electron desktop app
 * 2. Via `stacksolo serve` command
 * 3. Standalone API server
 */

export const API_URL = process.env.STACKSOLO_API_URL || 'http://localhost:4000';

interface TrpcResponse<T> {
  result?: {
    data: T;
  };
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Check if the StackSolo API is running and accessible
 */
export async function checkApiConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get API connection status with details
 */
export async function getApiStatus(): Promise<{
  connected: boolean;
  url: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      return { connected: true, url: API_URL };
    }
    return { connected: false, url: API_URL, error: `HTTP ${response.status}` };
  } catch (error) {
    return {
      connected: false,
      url: API_URL,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Call a tRPC procedure on the StackSolo API
 */
export async function callApi<T>(
  procedure: string,
  input: Record<string, unknown>
): Promise<T> {
  const [router, method] = procedure.split('.');

  // Determine if this is a query or mutation based on method name
  const isQuery = ['list', 'get', 'listByProject', 'getCode'].some((q) =>
    method.startsWith(q)
  );

  const url = new URL(`${API_URL}/trpc/${procedure}`);

  const response = await fetch(url.toString(), {
    method: isQuery ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: isQuery ? undefined : JSON.stringify(input),
    ...(isQuery && {
      // For queries, pass input as query param
      // tRPC expects input as JSON-encoded query param
    }),
  });

  // For queries, we need to pass input differently
  if (isQuery) {
    const queryUrl = new URL(`${API_URL}/trpc/${procedure}`);
    queryUrl.searchParams.set('input', JSON.stringify(input));

    const queryResponse = await fetch(queryUrl.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!queryResponse.ok) {
      const text = await queryResponse.text();
      throw new Error(`API error: ${queryResponse.status} - ${text}`);
    }

    const data = (await queryResponse.json()) as TrpcResponse<T>;
    if (data.error) {
      throw new Error(data.error.message);
    }
    return data.result?.data as T;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} - ${text}`);
  }

  const data = (await response.json()) as TrpcResponse<T>;
  if (data.error) {
    throw new Error(data.error.message);
  }
  return data.result?.data as T;
}
