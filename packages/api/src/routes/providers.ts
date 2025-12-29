import { z } from 'zod';
import { initTRPC } from '@trpc/server';
import { registry } from '@stacksolo/core';

const t = initTRPC.create();

export function createProviderRouter() {
  return t.router({
    list: t.procedure.query(async () => {
      const providers = registry.getAllProviders();
      return providers.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.icon,
        resourceCount: p.resources.length,
      }));
    }),

    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const provider = registry.getProvider(input.id);
        if (!provider) {
          throw new Error('Provider not found');
        }
        return {
          id: provider.id,
          name: provider.name,
          icon: provider.icon,
          authInstructions: provider.auth.instructions,
          resources: provider.resources.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            icon: r.icon,
          })),
        };
      }),

    checkAuth: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const provider = registry.getProvider(input.id);
        if (!provider) {
          throw new Error('Provider not found');
        }
        const isAuthenticated = await provider.auth.validate();
        return {
          providerId: input.id,
          isAuthenticated,
          instructions: isAuthenticated ? null : provider.auth.instructions,
        };
      }),

    getResourceType: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const resource = registry.getResource(input.id);
        if (!resource) {
          throw new Error('Resource type not found');
        }
        return {
          id: resource.id,
          provider: resource.provider,
          name: resource.name,
          description: resource.description,
          icon: resource.icon,
          configSchema: resource.configSchema,
          defaultConfig: resource.defaultConfig,
        };
      }),
  });
}
