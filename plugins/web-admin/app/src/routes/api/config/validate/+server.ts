import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { content, isJson } = await request.json();

    if (typeof content !== 'string') {
      return json({ valid: false, errors: ['Invalid content'] });
    }

    const errors: string[] = [];

    // Detect if content is JSON
    const looksLikeJson = content.trim().startsWith('{') || isJson;

    if (looksLikeJson) {
      // JSON validation
      try {
        const parsed = JSON.parse(content);

        // Check for required properties
        if (!parsed.project) {
          errors.push('Missing required property: project');
        } else {
          if (!parsed.project.name) {
            errors.push('Missing required property: project.name');
          }
          if (!parsed.project.gcpProjectId) {
            errors.push('Missing required property: project.gcpProjectId');
          }
          if (!parsed.project.region) {
            errors.push('Missing required property: project.region');
          }
        }
      } catch (parseErr) {
        errors.push(`Invalid JSON: ${parseErr instanceof Error ? parseErr.message : 'Parse error'}`);
      }
    } else {
      // TypeScript config validation
      // Check for required imports
      if (!content.includes('defineConfig')) {
        errors.push('Missing defineConfig import');
      }

      // Check for default export
      if (!content.includes('export default')) {
        errors.push('Missing default export');
      }

      // Check for balanced braces
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push('Unbalanced braces');
      }

      // Check for balanced parentheses
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        errors.push('Unbalanced parentheses');
      }

      // Check for balanced brackets
      const openBrackets = (content.match(/\[/g) || []).length;
      const closeBrackets = (content.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        errors.push('Unbalanced brackets');
      }

      // Check for required config properties
      if (!content.includes('name:') && !content.includes('name :') && !content.includes('"name"')) {
        errors.push('Missing required property: name');
      }
    }

    return json({
      valid: errors.length === 0,
      errors,
    });
  } catch (err) {
    console.error('Validation error:', err);
    return json({
      valid: false,
      errors: ['Validation failed'],
    });
  }
};
