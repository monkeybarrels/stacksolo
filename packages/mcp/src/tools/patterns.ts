import { registry } from '@stacksolo/core';
import type { InfrastructureSpec } from '@stacksolo/core';

/**
 * Analyze a project directory to detect matching app patterns
 */
export async function analyzeProject(
  projectPath: string
): Promise<{
  path: string;
  matchedPatterns: Array<{
    id: string;
    name: string;
    description: string;
    provider: string;
    prompts: Array<{ id: string; type: string; label: string }>;
  }>;
  recommendation: string | null;
}> {
  const patterns = registry.getAllPatterns();
  const matches: Array<{
    id: string;
    name: string;
    description: string;
    provider: string;
    prompts: Array<{ id: string; type: string; label: string }>;
  }> = [];

  for (const pattern of patterns) {
    try {
      const detected = await pattern.detect(projectPath);
      if (detected) {
        matches.push({
          id: pattern.id,
          name: pattern.name,
          description: pattern.description,
          provider: pattern.provider,
          prompts: pattern.prompts.map((p) => ({
            id: p.id,
            type: p.type,
            label: p.label,
          })),
        });
      }
    } catch {
      // Ignore detection errors
    }
  }

  return {
    path: projectPath,
    matchedPatterns: matches,
    recommendation:
      matches.length > 0
        ? `Recommended pattern: ${matches[0].name} (${matches[0].id})`
        : null,
  };
}

/**
 * Get infrastructure resources for a pattern with given answers
 */
export function getPatternInfrastructure(
  patternId: string,
  answers: Record<string, unknown>
): {
  patternId: string;
  infrastructure: InfrastructureSpec[];
  summary: string;
} {
  const pattern = registry.getPattern(patternId);
  if (!pattern) {
    throw new Error(`Pattern not found: ${patternId}`);
  }

  const infrastructure = pattern.infrastructure(answers);

  return {
    patternId,
    infrastructure,
    summary: `Will create ${infrastructure.length} resources: ${infrastructure.map((r) => r.name).join(', ')}`,
  };
}
