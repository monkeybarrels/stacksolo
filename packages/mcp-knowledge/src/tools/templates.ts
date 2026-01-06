/**
 * Templates Tools
 *
 * Tools for listing and getting details about app templates.
 */

import type { Tool } from './types';
import { fetchFromGitHub, TemplateManifest } from './github';
import { templatesOverview, getTemplateGuide } from '../knowledge/index';

export const templatesTool: Tool = {
  definition: {
    name: 'stacksolo_templates',
    description:
      'List available app templates that can be used with "stacksolo init --template <name>". Templates include full source code for common app patterns.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  handler: async () => {
    try {
      const templatesManifest = (await fetchFromGitHub('templates.json')) as TemplateManifest;

      let output = '# Available App Templates\n\n';
      output += '*Use with: `stacksolo init --template <id>`*\n\n';

      if (templatesManifest.templates.length === 0) {
        output += 'No templates available yet.\n';
      } else {
        output += '| Template | Description | Difficulty | Tags |\n';
        output += '|----------|-------------|------------|------|\n';
        for (const template of templatesManifest.templates) {
          output += `| **${template.name}** (\`${template.id}\`) | ${template.description} | ${template.difficulty} | ${template.tags.join(', ')} |\n`;
        }
        output += '\n';

        // Add info about Firebase templates using kernel
        const firebaseTemplates = templatesManifest.templates.filter((t) =>
          t.tags.includes('firebase')
        );
        if (firebaseTemplates.length > 0) {
          output += '## Firebase Templates\n\n';
          output +=
            'Firebase templates use `@stacksolo/runtime` with `kernel.authMiddleware()` for token verification.\n';
          output += 'They require `gcpKernel` in config and `@stacksolo/plugin-gcp-kernel` plugin.\n\n';
        }

        output += '## Quick Start\n\n';
        output += '```bash\n';
        output += '# Create a new project from template\n';
        output += 'stacksolo init --template firebase-postgres\n\n';
        output += '# List available templates\n';
        output += 'stacksolo init --list-templates\n';
        output += '```\n\n';

        output += '## Get Detailed Guide\n\n';
        output +=
          'Use the `stacksolo_template_guide` tool with a template ID for detailed documentation:\n';
        output += '- Architecture and code patterns\n';
        output += '- How to add features\n';
        output += '- Deployment instructions\n';
      }

      return {
        content: [{ type: 'text', text: output }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: '# Templates\n\nNo templates repository configured yet. Use built-in project types:\n\n- `function-api` - Serverless API\n- `container-api` - Container API\n- `ui-api` - UI + API\n- `ui-only` - Static UI\n',
          },
        ],
      };
    }
  },
};

export const templateGuideTool: Tool = {
  definition: {
    name: 'stacksolo_template_guide',
    description:
      'Get a detailed guide for a specific app template. Includes architecture, code patterns, how to add features, and deployment instructions. Use stacksolo_templates first to see available template IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          description:
            'The template ID (e.g., "firebase-app", "firebase-postgres", "api-starter", "static-site")',
        },
      },
      required: ['template'],
    },
  },
  handler: async (args) => {
    const { template } = args as { template: string };

    // First check for built-in guide (more detailed)
    const guide = getTemplateGuide(template);

    if (guide) {
      return {
        content: [{ type: 'text', text: guide }],
      };
    }

    // If no built-in guide, try to fetch from GitHub
    try {
      const templatesManifest = (await fetchFromGitHub('templates.json')) as {
        templates: Array<{ id: string; path: string; name: string; description: string }>;
      };
      const templateMeta = templatesManifest.templates.find((t) => t.id === template);

      if (templateMeta) {
        // Fetch the README from GitHub
        const readme = await fetchFromGitHub(`${templateMeta.path}/README.md`);
        if (readme) {
          let output = `# ${templateMeta.name}\n\n`;
          output += `${templateMeta.description}\n\n`;
          output += '---\n\n';
          output += readme as string;
          return {
            content: [{ type: 'text', text: output }],
          };
        }
      }
    } catch (e) {
      // Fall through to default response
    }

    // If all else fails, return the overview with available templates
    return {
      content: [
        {
          type: 'text',
          text: `# Template Not Found\n\nNo guide found for template "${template}".\n\n${templatesOverview}`,
        },
      ],
    };
  },
};
