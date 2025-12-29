import type {
  Project,
  Resource,
  Deployment,
  CreateProjectInput,
  UpdateProjectInput,
  CreateResourceInput,
  UpdateResourceInput,
} from '@stacksolo/shared';

export interface ProjectRepository {
  create(data: CreateProjectInput): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findAll(): Promise<Project[]>;
  update(id: string, data: UpdateProjectInput): Promise<Project>;
  delete(id: string): Promise<void>;
}

export interface ResourceRepository {
  create(data: CreateResourceInput): Promise<Resource>;
  findById(id: string): Promise<Resource | null>;
  findByProjectId(projectId: string): Promise<Resource[]>;
  update(id: string, data: UpdateResourceInput): Promise<Resource>;
  delete(id: string): Promise<void>;
}

export interface DeploymentRepository {
  create(projectId: string): Promise<Deployment>;
  findById(id: string): Promise<Deployment | null>;
  findByProjectId(projectId: string): Promise<Deployment[]>;
  updateStatus(
    id: string,
    status: Deployment['status'],
    logs?: string,
    error?: string
  ): Promise<Deployment>;
}
