import { registry } from '@stacksolo/core';
import type { Resource, Project, GeneratedFile } from '@stacksolo/shared';

/**
 * @deprecated This service generates legacy Pulumi code.
 * The main deployment path now uses CDKTF via the CLI.
 * Use `stacksolo deploy` instead.
 */
export class CodegenService {
  /**
   * Generate infrastructure code for a project and its resources.
   * @deprecated Use CLI `stacksolo deploy` which generates CDKTF code.
   */
  generateProjectCode(project: Project, resources: Resource[]): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Collect all code from resources
    const allImports = new Set<string>();
    const allCode: string[] = [];
    const allOutputs: string[] = [];

    for (const resource of resources) {
      const resourceType = registry.getResource(resource.type);
      if (!resourceType) {
        console.warn(`Unknown resource type: ${resource.type}`);
        continue;
      }

      const generated = resourceType.generate({
        name: resource.name,
        ...resource.config,
      });

      generated.imports.forEach((imp) => allImports.add(imp));
      allCode.push(`// ${resource.name} (${resourceType.name})`);
      allCode.push(generated.code);
      allCode.push('');

      if (generated.outputs) {
        allOutputs.push(...generated.outputs);
      }
    }

    // Generate index.ts (CDKTF-style)
    const indexContent = this.generateIndexTs(
      project,
      Array.from(allImports),
      allCode,
      allOutputs
    );
    files.push({ path: 'index.ts', content: indexContent });

    // Generate cdktf.json
    const cdktfJson = this.generateCdktfJson(project);
    files.push({ path: 'cdktf.json', content: cdktfJson });

    // Generate package.json
    const packageJson = this.generatePackageJson(project);
    files.push({ path: 'package.json', content: packageJson });

    // Generate tsconfig.json
    const tsconfig = this.generateTsconfig();
    files.push({ path: 'tsconfig.json', content: tsconfig });

    return files;
  }

  private generateIndexTs(
    project: Project,
    imports: string[],
    code: string[],
    outputs: string[]
  ): string {
    const lines: string[] = [];

    // CDKTF imports
    lines.push("import { Construct } from 'constructs';");
    lines.push("import { App, TerraformStack, TerraformOutput } from 'cdktf';");
    imports.forEach((imp) => lines.push(imp));
    lines.push('');

    // Stack class
    const stackName = project.name.replace(/[^a-zA-Z0-9]/g, '');
    lines.push(`class ${stackName}Stack extends TerraformStack {`);
    lines.push('  constructor(scope: Construct, id: string) {');
    lines.push('    super(scope, id);');
    lines.push('');

    // Config variables
    if (project.provider === 'gcp' && project.providerConfig.projectId) {
      lines.push(`    const gcpProject = "${project.providerConfig.projectId}";`);
    }
    if (project.providerConfig.region) {
      lines.push(`    const region = "${project.providerConfig.region}";`);
    }
    lines.push('');

    // Resources (indented inside constructor)
    lines.push('    // Resources');
    code.forEach((line) => {
      lines.push('    ' + line);
    });

    // Outputs
    if (outputs.length > 0) {
      lines.push('');
      lines.push('    // Outputs');
      outputs.forEach((output) => {
        lines.push('    ' + output);
      });
    }

    lines.push('  }');
    lines.push('}');
    lines.push('');

    // App instantiation
    lines.push('const app = new App();');
    lines.push(`new ${stackName}Stack(app, '${project.name}');`);
    lines.push('app.synth();');

    return lines.join('\n');
  }

  private generateCdktfJson(project: Project): string {
    const projectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return JSON.stringify(
      {
        language: 'typescript',
        app: 'npx ts-node main.ts',
        projectId: projectName,
        terraformProviders: [
          project.provider === 'gcp' ? 'hashicorp/google@~> 5.0' : null,
        ].filter(Boolean),
      },
      null,
      2
    );
  }

  private generatePackageJson(project: Project): string {
    const projectName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const deps: Record<string, string> = {
      cdktf: '^0.20.0',
      constructs: '^10.0.0',
    };

    if (project.provider === 'gcp') {
      deps['@cdktf/provider-google'] = '^14.0.0';
    }

    return JSON.stringify(
      {
        name: projectName,
        main: 'main.ts',
        scripts: {
          build: 'tsc',
          synth: 'cdktf synth',
          deploy: 'cdktf deploy',
          destroy: 'cdktf destroy',
        },
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
          'ts-node': '^10.0.0',
        },
        dependencies: deps,
      },
      null,
      2
    );
  }

  private generateTsconfig(): string {
    return JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          outDir: 'dist',
        },
        include: ['*.ts'],
      },
      null,
      2
    );
  }
}
