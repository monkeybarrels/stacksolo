import { z } from 'zod';
import { initTRPC } from '@trpc/server';
import type { ProjectRepository } from '../repositories/interfaces.js';

const t = initTRPC.create();

export function createProjectRouter(projectRepo: ProjectRepository) {
  return t.router({
    list: t.procedure.query(async () => {
      return projectRepo.findAll();
    }),

    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const project = await projectRepo.findById(input.id);
        if (!project) {
          throw new Error('Project not found');
        }
        return project;
      }),

    create: t.procedure
      .input(
        z.object({
          name: z.string().min(1).max(100),
          provider: z.string(),
          providerConfig: z.object({
            projectId: z.string().optional(),
            region: z.string().optional(),
          }).passthrough(),
          patternId: z.string().optional(),
          path: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return projectRepo.create(input);
      }),

    update: t.procedure
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(100).optional(),
          providerConfig: z.object({
            projectId: z.string().optional(),
            region: z.string().optional(),
          }).passthrough().optional(),
          patternId: z.string().optional(),
          path: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return projectRepo.update(id, data);
      }),

    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        await projectRepo.delete(input.id);
        return { success: true };
      }),
  });
}
