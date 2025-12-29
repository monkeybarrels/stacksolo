import { initTRPC } from '@trpc/server';
import { createProjectRouter } from './projects';
import { createResourceRouter } from './resources';
import { createDeploymentRouter } from './deployments';
import { createProviderRouter } from './providers';
import { createPatternRouter } from './patterns';
import type {
  ProjectRepository,
  ResourceRepository,
  DeploymentRepository,
} from '../repositories/interfaces';

const t = initTRPC.create();

export function createAppRouter(
  projectRepo: ProjectRepository,
  resourceRepo: ResourceRepository,
  deploymentRepo: DeploymentRepository
) {
  return t.router({
    projects: createProjectRouter(projectRepo),
    resources: createResourceRouter(resourceRepo),
    deployments: createDeploymentRouter(projectRepo, resourceRepo, deploymentRepo),
    providers: createProviderRouter(),
    patterns: createPatternRouter(),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
