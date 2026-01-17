import { z } from 'zod';
import { initTRPC } from '@trpc/server';
import { registry } from '@stacksolo/core';
import type {
  ProjectRepository,
  ResourceRepository,
  DeploymentRepository,
} from '../repositories/interfaces.js';
import { CodegenService } from '../services/codegen.service.js';
import { BuildService } from '../services/build.service.js';
import { ConfigService } from '../services/config.service.js';

const t = initTRPC.create();

export function createDeploymentRouter(
  projectRepo: ProjectRepository,
  resourceRepo: ResourceRepository,
  deploymentRepo: DeploymentRepository
) {
  const codegenService = new CodegenService();
  const buildService = new BuildService(deploymentRepo);
  const configService = new ConfigService();

  return t.router({
    listByProject: t.procedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ input }) => {
        return deploymentRepo.findByProjectId(input.projectId);
      }),

    get: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const deployment = await deploymentRepo.findById(input.id);
        if (!deployment) {
          throw new Error('Deployment not found');
        }
        return deployment;
      }),

    // Get latest deployment status for a project
    status: t.procedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ input }) => {
        const deployments = await deploymentRepo.findByProjectId(input.projectId);
        if (deployments.length === 0) {
          return null;
        }
        // Return the most recent deployment
        return deployments[0];
      }),

    // Get generated code for preview
    getCode: t.procedure
      .input(z.object({ projectId: z.string() }))
      .query(async ({ input }) => {
        const project = await projectRepo.findById(input.projectId);
        if (!project) {
          throw new Error('Project not found');
        }

        const resources = await resourceRepo.findByProjectId(input.projectId);
        return codegenService.generateProjectCode(project, resources);
      }),

    // Start a new deployment
    deploy: t.procedure
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ input }) => {
        const project = await projectRepo.findById(input.projectId);
        if (!project) {
          throw new Error('Project not found');
        }

        let resources = await resourceRepo.findByProjectId(input.projectId);

        // For pattern-based projects, auto-generate resources from the pattern
        if (resources.length === 0 && project.patternId) {
          const pattern = registry.getPattern(project.patternId);
          if (pattern) {
            // Generate resources from pattern's infrastructure function
            // Use default answers (empty object) - prompts would have been answered during init
            const infraResources = pattern.infrastructure({});
            for (const infraResource of infraResources) {
              await resourceRepo.create({
                projectId: project.id,
                type: infraResource.type,
                name: infraResource.name,
                config: infraResource.config || {},
              });
            }
            // Re-fetch resources after creation
            resources = await resourceRepo.findByProjectId(input.projectId);
          }
        }

        if (resources.length === 0) {
          throw new Error('No resources to deploy. Add resources or use a pattern.');
        }

        // Filter out resources that require a build but don't have an image yet
        // Cloud Run requires an image - skip it if not built yet
        const deployableResources = resources.filter((resource) => {
          if (resource.type === 'gcp:cloud_run') {
            const config = resource.config as { image?: string };
            if (!config.image) {
              console.log(`Skipping ${resource.name}: no image built yet. Run 'stacksolo deploy --build' first.`);
              return false;
            }
          }
          return true;
        });

        if (deployableResources.length === 0) {
          throw new Error(
            'No deployable resources. Cloud Run requires a built image. Run: stacksolo deploy --build'
          );
        }

        // Use filtered resources for deployment
        resources = deployableResources;

        // Create deployment record
        const deployment = await deploymentRepo.create(input.projectId);

        // TODO: Legacy API - use CLI `stacksolo deploy` instead
        throw new Error('API deployment is deprecated. Use CLI: stacksolo deploy');

        return deployment;
      }),

    // Preview deployment (dry run)
    preview: t.procedure
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ input }) => {
        // TODO: Legacy API - use CLI `stacksolo deploy --preview` instead
        throw new Error('API preview is deprecated. Use CLI: stacksolo deploy --preview');
      }),

    // Destroy deployed resources
    destroy: t.procedure
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ input }) => {
        // TODO: Legacy API - use CLI `stacksolo destroy` instead
        throw new Error('API destroy is deprecated. Use CLI: stacksolo destroy');
      }),

    // Build Docker image for app pattern
    build: t.procedure
      .input(z.object({ projectId: z.string() }))
      .mutation(async ({ input }) => {
        const project = await projectRepo.findById(input.projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        if (!project.path) {
          throw new Error('Project path is required for build');
        }
        if (!project.patternId) {
          throw new Error('Project pattern is required for build');
        }

        // Get the pattern from registry
        const pattern = registry.getPattern(project.patternId);
        if (!pattern) {
          throw new Error(`Pattern not found: ${project.patternId}`);
        }

        // Create deployment record
        const deployment = await deploymentRepo.create(input.projectId);

        // Run build in background
        buildService.build(project, pattern, deployment).catch((err) => {
          console.error('Build error:', err);
        });

        return deployment;
      }),

    // Generate config files (.env.local + stacksolo.config.ts)
    generateConfig: t.procedure
      .input(
        z.object({
          projectId: z.string(),
          resourceOutputs: z
            .record(
              z.object({
                outputs: z.record(z.string()).optional(),
              })
            )
            .optional(),
        })
      )
      .mutation(async ({ input }) => {
        const project = await projectRepo.findById(input.projectId);
        if (!project) {
          throw new Error('Project not found');
        }
        if (!project.path) {
          throw new Error('Project path is required for config generation');
        }
        if (!project.patternId) {
          throw new Error('Project pattern is required for config generation');
        }

        // Get the pattern from registry
        const pattern = registry.getPattern(project.patternId);
        if (!pattern) {
          throw new Error(`Pattern not found: ${project.patternId}`);
        }

        // Generate config files
        const result = await configService.generateConfig(
          project,
          pattern,
          input.resourceOutputs || {}
        );

        return {
          success: true,
          files: [result.envPath, result.configPath],
        };
      }),
  });
}
