/**
 * Service client for calling other services in the stack
 */

import { env } from './env';

export interface ServiceCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ServiceResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Call another service in the stack via the gateway
 *
 * @example
 * // Call the hello service
 * const response = await services.call('hello', '/greet', { name: 'world' });
 *
 * // Call with custom options
 * const response = await services.call('api', '/users', {
 *   method: 'POST',
 *   body: { email: 'user@example.com' }
 * });
 */
export async function call<T = unknown>(
  service: string,
  path: string,
  options: ServiceCallOptions = {}
): Promise<ServiceResponse<T>> {
  const { method = 'GET', body, headers = {}, timeout = 30000 } = options;

  // Build URL through gateway
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  const url = `${env.gatewayUrl}/${service}${normalizedPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json().catch(() => null);

    return {
      ok: response.ok,
      status: response.status,
      data: data as T,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Service call to ${service}${path} timed out after ${timeout}ms`);
    }

    throw error;
  }
}

/**
 * Create a typed service client
 *
 * @example
 * const hello = services.create<HelloService>('hello');
 * const response = await hello.get('/greet');
 */
export function create<T = unknown>(service: string) {
  return {
    get: (path: string, options?: Omit<ServiceCallOptions, 'method'>) =>
      call<T>(service, path, { ...options, method: 'GET' }),

    post: (path: string, body?: unknown, options?: Omit<ServiceCallOptions, 'method' | 'body'>) =>
      call<T>(service, path, { ...options, method: 'POST', body }),

    put: (path: string, body?: unknown, options?: Omit<ServiceCallOptions, 'method' | 'body'>) =>
      call<T>(service, path, { ...options, method: 'PUT', body }),

    patch: (path: string, body?: unknown, options?: Omit<ServiceCallOptions, 'method' | 'body'>) =>
      call<T>(service, path, { ...options, method: 'PATCH', body }),

    delete: (path: string, options?: Omit<ServiceCallOptions, 'method'>) =>
      call<T>(service, path, { ...options, method: 'DELETE' }),
  };
}

export const services = {
  call,
  create,
};
