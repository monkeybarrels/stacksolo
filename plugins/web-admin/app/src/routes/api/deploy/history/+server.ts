import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execCLI, parseJSONOutput } from '$lib/cli';

export const GET: RequestHandler = async () => {
  try {
    const result = await execCLI(['deploy', 'history', '--json']);

    if (!result.success) {
      // Return empty history if command fails
      return json([]);
    }

    const data = parseJSONOutput<{
      deployments: Array<{
        id: string;
        status: string;
        startedAt: string;
        finishedAt?: string;
        message?: string;
      }>;
    }>(result);

    return json(data?.deployments || []);
  } catch (err) {
    console.error('Failed to get deployment history:', err);
    return json([]);
  }
};
