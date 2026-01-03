import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import * as path from 'path';

export const POST: RequestHandler = async () => {
  try {
    const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();

    // Start dev in background using spawn with detached
    const child = spawn('stacksolo', ['dev'], {
      cwd: projectPath,
      detached: true,
      stdio: 'ignore',
      shell: true,
    });

    // Unref so parent can exit independently
    child.unref();

    return json({ success: true, message: 'Dev environment starting...' });
  } catch (err) {
    console.error('Failed to start local dev:', err);
    return json({ error: 'Failed to start local dev' }, { status: 500 });
  }
};
