import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Support both config formats
const CONFIG_FILES = [
  '.stacksolo/stacksolo.config.json',
  'stacksolo.config.ts',
  'stacksolo.config.json',
];

async function findConfigPath(projectPath: string): Promise<{ path: string; isJson: boolean } | null> {
  for (const file of CONFIG_FILES) {
    const fullPath = join(projectPath, file);
    try {
      await readFile(fullPath, 'utf-8');
      return { path: fullPath, isJson: file.endsWith('.json') };
    } catch {
      // Try next file
    }
  }
  return null;
}

export const GET: RequestHandler = async () => {
  try {
    const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();
    const configInfo = await findConfigPath(projectPath);

    if (!configInfo) {
      return json({
        content: `// No config file found in ${projectPath}
// Create .stacksolo/stacksolo.config.json or stacksolo.config.ts
`,
        isJson: false,
      });
    }

    const content = await readFile(configInfo.path, 'utf-8');
    return json({ content, isJson: configInfo.isJson, path: configInfo.path });
  } catch (err) {
    console.error('Failed to read config:', err);
    return json({ error: 'Failed to read config' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ request }) => {
  try {
    const { content } = await request.json();

    if (typeof content !== 'string') {
      return json({ error: 'Invalid content' }, { status: 400 });
    }

    const projectPath = process.env.STACKSOLO_PROJECT_PATH || process.cwd();
    const configInfo = await findConfigPath(projectPath);

    if (!configInfo) {
      return json({ error: 'No config file found' }, { status: 404 });
    }

    // Validate JSON if it's a JSON file
    if (configInfo.isJson) {
      try {
        JSON.parse(content);
      } catch {
        return json({ error: 'Invalid JSON syntax' }, { status: 400 });
      }
    }

    await writeFile(configInfo.path, content, 'utf-8');
    return json({ success: true });
  } catch (err) {
    console.error('Failed to save config:', err);
    return json({ error: 'Failed to save config' }, { status: 500 });
  }
};
