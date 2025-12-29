import { z } from 'zod';
import { initTRPC } from '@trpc/server';
import { registry } from '@stacksolo/core';

const t = initTRPC.create();

export function createPatternRouter() {
  return t.router({
    // List all available patterns
    list: t.procedure.query(() => {
      const patterns = registry.getAllPatterns();
      return patterns.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        provider: p.provider,
        prompts: p.prompts,
      }));
    }),

    // Get a specific pattern by ID
    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const pattern = registry.getPattern(input.id);
        if (!pattern) {
          throw new Error(`Pattern not found: ${input.id}`);
        }
        return {
          id: pattern.id,
          name: pattern.name,
          description: pattern.description,
          icon: pattern.icon,
          provider: pattern.provider,
          prompts: pattern.prompts,
        };
      }),

    // Detect which patterns match a project path
    detect: t.procedure
      .input(z.object({ path: z.string() }))
      .query(async ({ input }) => {
        const patterns = registry.getAllPatterns();
        const matches: Array<{
          id: string;
          name: string;
          description: string;
          icon: string;
          provider: string;
        }> = [];

        for (const pattern of patterns) {
          try {
            const detected = await pattern.detect(input.path);
            if (detected) {
              matches.push({
                id: pattern.id,
                name: pattern.name,
                description: pattern.description,
                icon: pattern.icon,
                provider: pattern.provider,
              });
            }
          } catch {
            // Ignore detection errors for individual patterns
          }
        }

        return matches;
      }),

    // Get infrastructure specs for a pattern with answers
    getInfrastructure: t.procedure
      .input(
        z.object({
          patternId: z.string(),
          answers: z.record(z.unknown()),
        })
      )
      .query(({ input }) => {
        const pattern = registry.getPattern(input.patternId);
        if (!pattern) {
          throw new Error(`Pattern not found: ${input.patternId}`);
        }
        return pattern.infrastructure(input.answers);
      }),
  });
}
