import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execCLI, parseJSONOutput } from '$lib/cli';

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    // Get logs for specific resource
    const result = await execCLI(['logs', id, '--json', '--tail', '100']);

    if (!result.success) {
      // Return empty logs if command fails (resource might not have logs)
      return json({ logs: [] });
    }

    const data = parseJSONOutput<{
      logs: Array<{
        id: string;
        timestamp: string;
        message: string;
        level: string;
      }>;
    }>(result);

    return json({
      logs: data?.logs || [],
    });
  } catch (err) {
    console.error('Failed to get resource logs:', err);
    return json({ logs: [] });
  }
};
