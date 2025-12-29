import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Project, Deployment } from '@stacksolo/shared';
import type { AppPattern } from '@stacksolo/core';
import type { DeploymentRepository } from '../repositories/interfaces';
import { deploymentEvents } from './deployment-events';

export class BuildService {
  private deploymentRepo: DeploymentRepository;

  constructor(deploymentRepo: DeploymentRepository) {
    this.deploymentRepo = deploymentRepo;
  }

  /**
   * Build and push a Docker image for a project using an app pattern
   */
  async build(
    project: Project,
    pattern: AppPattern,
    deployment: Deployment
  ): Promise<Deployment> {
    if (!project.path) {
      throw new Error('Project path is required for build');
    }

    try {
      await this.deploymentRepo.updateStatus(deployment.id, 'running');
      deploymentEvents.emitStatus(deployment.id, 'running');
      deploymentEvents.emitLog(deployment.id, 'Starting build...');

      const logs: string[] = [];

      // Step 1: Generate Dockerfile
      deploymentEvents.emitLog(deployment.id, 'Generating Dockerfile...');
      const dockerfile = await pattern.build.generateDockerfile(project.path);
      const dockerfilePath = path.join(project.path, 'Dockerfile.stacksolo');
      await fs.writeFile(dockerfilePath, dockerfile);
      logs.push(`Generated Dockerfile at ${dockerfilePath}`);
      deploymentEvents.emitLog(deployment.id, 'Dockerfile generated');

      // Step 2: Build Docker image
      const imageName = this.getImageName(project);
      deploymentEvents.emitLog(deployment.id, `Building Docker image: ${imageName}...`);

      const buildResult = await this.runCommand(
        `docker build -f Dockerfile.stacksolo -t ${imageName} .`,
        project.path,
        deployment.id
      );
      logs.push(buildResult);

      // Step 3: Push to Artifact Registry
      deploymentEvents.emitLog(deployment.id, 'Pushing image to Artifact Registry...');
      const pushResult = await this.runCommand(
        `docker push ${imageName}`,
        project.path,
        deployment.id
      );
      logs.push(pushResult);

      // Success
      deploymentEvents.emitLog(deployment.id, 'Build complete!');
      deploymentEvents.emitComplete(deployment.id, true);
      return await this.deploymentRepo.updateStatus(
        deployment.id,
        'succeeded',
        logs.join('\n')
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      deploymentEvents.emitError(deployment.id, errorMessage);
      deploymentEvents.emitComplete(deployment.id, false);
      return await this.deploymentRepo.updateStatus(
        deployment.id,
        'failed',
        undefined,
        errorMessage
      );
    }
  }

  /**
   * Generate the full image name for Artifact Registry
   */
  private getImageName(project: Project): string {
    const region = (project.providerConfig.region as string) || 'us-central1';
    const gcpProject = project.providerConfig.projectId as string;
    const repoName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${region}-docker.pkg.dev/${gcpProject}/${repoName}/app:latest`;
  }

  /**
   * Run a shell command with real-time logging
   */
  private runCommand(
    command: string,
    cwd: string,
    deploymentId: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }); // 10MB buffer
      let output = '';

      child.stdout?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        output += text;
        // Split by newlines and emit each line
        text.split('\n').filter(Boolean).forEach((line) => {
          deploymentEvents.emitLog(deploymentId, line);
        });
      });

      child.stderr?.on('data', (data: Buffer | string) => {
        const text = data.toString();
        output += text;
        text.split('\n').filter(Boolean).forEach((line) => {
          deploymentEvents.emitLog(deploymentId, line);
        });
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command}`));
        }
      });

      child.on('error', reject);
    });
  }
}
