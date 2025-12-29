import * as pulumi from '@pulumi/pulumi/automation/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import type { Project, Resource, Deployment } from '@stacksolo/shared';
import type { DeploymentRepository } from '../repositories/interfaces';
import { CodegenService } from './codegen.service';
import { deploymentEvents } from './deployment-events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local state storage directory
const PULUMI_STATE_DIR = process.env.PULUMI_STATE_DIR ||
  path.join(__dirname, '../../.pulumi-state');

export class PulumiService {
  private codegenService: CodegenService;
  private deploymentRepo: DeploymentRepository;

  constructor(deploymentRepo: DeploymentRepository) {
    this.codegenService = new CodegenService();
    this.deploymentRepo = deploymentRepo;
  }

  /**
   * Get environment variables for Pulumi commands with local backend
   */
  private getPulumiEnv(): Record<string, string> {
    return {
      ...process.env as Record<string, string>,
      PULUMI_BACKEND_URL: `file://${PULUMI_STATE_DIR}`,
      PULUMI_CONFIG_PASSPHRASE: '', // No passphrase for local dev
    };
  }

  /**
   * Deploy a project using Pulumi Automation API
   */
  async deploy(
    project: Project,
    resources: Resource[],
    deployment: Deployment
  ): Promise<Deployment> {
    const workDir = await this.prepareWorkDir(project, resources);

    try {
      // Ensure state directory exists
      await fs.mkdir(PULUMI_STATE_DIR, { recursive: true });

      // Update status to running
      await this.deploymentRepo.updateStatus(deployment.id, 'running');
      deploymentEvents.emitStatus(deployment.id, 'running');
      deploymentEvents.emitLog(deployment.id, 'Starting deployment...');

      // Create or select stack with local backend
      const stackName = 'dev';
      const projectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      deploymentEvents.emitLog(deployment.id, 'Creating Pulumi stack...');
      const stack = await pulumi.LocalWorkspace.createOrSelectStack(
        {
          stackName,
          workDir,
        },
        {
          projectSettings: {
            name: projectName,
            runtime: 'nodejs',
          },
          envVars: this.getPulumiEnv(),
        }
      );

      // Set GCP project config if applicable
      if (project.provider === 'gcp' && project.providerConfig.projectId) {
        await stack.setConfig('gcp:project', {
          value: project.providerConfig.projectId as string,
        });
      }
      if (project.providerConfig.region) {
        await stack.setConfig('gcp:region', {
          value: project.providerConfig.region as string,
        });
      }

      // Install dependencies
      deploymentEvents.emitLog(deployment.id, 'Installing Pulumi GCP plugin...');
      await stack.workspace.installPlugin('gcp', 'v7.0.0');

      // Run npm install in workdir
      deploymentEvents.emitLog(deployment.id, 'Installing npm dependencies...');
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('npm install', { cwd: workDir });

      // Run pulumi up
      deploymentEvents.emitLog(deployment.id, 'Running pulumi up...');
      const logs: string[] = [];
      await stack.up({
        onOutput: (msg) => {
          logs.push(msg);
          deploymentEvents.emitLog(deployment.id, msg);
        },
      });

      // Update deployment as succeeded
      deploymentEvents.emitComplete(deployment.id, true);
      return await this.deploymentRepo.updateStatus(
        deployment.id,
        'succeeded',
        logs.join('\n')
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for GCP auth errors and emit auth_required event
      if (errorMessage.includes('invalid_grant') || errorMessage.includes('reauth related error')) {
        deploymentEvents.emitAuthRequired(deployment.id, 'gcp');
        deploymentEvents.emitError(
          deployment.id,
          'GCP authentication expired. Run: gcloud auth application-default login'
        );
      } else {
        deploymentEvents.emitError(deployment.id, errorMessage);
      }

      deploymentEvents.emitComplete(deployment.id, false);
      return await this.deploymentRepo.updateStatus(
        deployment.id,
        'failed',
        undefined,
        errorMessage
      );
    } finally {
      // Cleanup work directory (optional - keep for debugging)
      // await fs.rm(workDir, { recursive: true });
    }
  }

  /**
   * Preview a deployment (dry run)
   */
  async preview(
    project: Project,
    resources: Resource[]
  ): Promise<{ changes: string }> {
    const workDir = await this.prepareWorkDir(project, resources);

    try {
      // Ensure state directory exists
      await fs.mkdir(PULUMI_STATE_DIR, { recursive: true });

      const stackName = 'dev';
      const projectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const stack = await pulumi.LocalWorkspace.createOrSelectStack(
        {
          stackName,
          workDir,
        },
        {
          projectSettings: {
            name: projectName,
            runtime: 'nodejs',
          },
          envVars: this.getPulumiEnv(),
        }
      );

      // Set config
      if (project.provider === 'gcp' && project.providerConfig.projectId) {
        await stack.setConfig('gcp:project', {
          value: project.providerConfig.projectId as string,
        });
      }

      // Install dependencies
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('npm install', { cwd: workDir });

      // Run preview
      const logs: string[] = [];
      await stack.preview({
        onOutput: (msg) => logs.push(msg),
      });

      return { changes: logs.join('\n') };
    } finally {
      // Cleanup
      // await fs.rm(workDir, { recursive: true });
    }
  }

  /**
   * Destroy deployed resources
   */
  async destroy(project: Project, resources: Resource[]): Promise<void> {
    const workDir = await this.prepareWorkDir(project, resources);

    try {
      const stackName = 'dev';
      const projectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

      const stack = await pulumi.LocalWorkspace.selectStack(
        {
          stackName,
          workDir,
        },
        {
          projectSettings: {
            name: projectName,
            runtime: 'nodejs',
          },
          envVars: this.getPulumiEnv(),
        }
      );

      await stack.destroy({ onOutput: console.log });
    } finally {
      // Cleanup
    }
  }

  /**
   * Prepare working directory with generated code
   */
  private async prepareWorkDir(
    project: Project,
    resources: Resource[]
  ): Promise<string> {
    // Create temp directory for this deployment
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `stacksolo-${project.id}-`)
    );

    // Generate code files
    const files = this.codegenService.generateProjectCode(project, resources);

    // Write files to temp directory
    for (const file of files) {
      const filePath = path.join(tmpDir, file.path);
      await fs.writeFile(filePath, file.content, 'utf-8');
    }

    return tmpDir;
  }
}
