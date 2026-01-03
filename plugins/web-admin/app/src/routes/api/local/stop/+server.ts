import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execCLI } from '$lib/cli';

export const POST: RequestHandler = async () => {
  try {
    const result = await execCLI(['dev', '--stop'], {
      timeout: 30000,
    });

    if (!result.success) {
      return json(
        { error: result.stderr || 'Failed to stop local dev' },
        { status: 500 }
      );
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to stop local dev:', err);
    return json({ error: 'Failed to stop local dev' }, { status: 500 });
  }
};
