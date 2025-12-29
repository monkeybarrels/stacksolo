import { z } from 'zod';
import { initTRPC } from '@trpc/server';
import type { ResourceRepository } from '../repositories/interfaces.js';

const t = initTRPC.create();

export function createResourceRouter(resourceRepo: ResourceRepository) {
  return t.router({
    listByProject: t.procedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ input }) => {
        return resourceRepo.findByProjectId(input.projectId);
      }),

    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const resource = await resourceRepo.findById(input.id);
        if (!resource) {
          throw new Error('Resource not found');
        }
        return resource;
      }),

    create: t.procedure
      .input(
        z.object({
          projectId: z.string(),
          type: z.string(),
          name: z.string().min(1).max(100),
          config: z.record(z.unknown()),
        })
      )
      .mutation(async ({ input }) => {
        return resourceRepo.create(input);
      }),

    update: t.procedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(100).optional(),
          config: z.record(z.unknown()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return resourceRepo.update(id, data);
      }),

    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await resourceRepo.delete(input.id);
        return { success: true };
      }),
  });
}
