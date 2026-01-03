import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execCLI } from '$lib/cli';

export const POST: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    const result = await execCLI(['deploy', 'rollback', id]);

    if (!result.success) {
      return json(
        { error: result.stderr || 'Rollback failed' },
        { status: 500 }
      );
    }

    return json({ success: true });
  } catch (err) {
    console.error('Failed to rollback:', err);
    return json({ error: 'Rollback failed' }, { status: 500 });
  }
};
