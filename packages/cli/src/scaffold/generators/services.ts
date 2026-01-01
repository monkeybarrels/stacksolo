/**
 * Service scaffolder
 * Orchestrates scaffolding for containers, functions, UIs, and kernel
 */

import type { StackSoloConfig } from '@stacksolo/blueprint';
import type { ServiceScaffold, GeneratedFile } from './types';
import { generateContainerScaffold } from './resources/container';
import { generateFunctionScaffold } from './resources/function';
import { generateUIScaffold } from './resources/ui';
import { generateKernelScaffold } from './resources/kernel';

interface ServicesGeneratorResult {
  services: ServiceScaffold[];
  files: GeneratedFile[];
  uiCount: number;
}

/**
 * Generate service scaffolds from config
 */
export function generateServiceScaffolds(
  config: StackSoloConfig
): ServicesGeneratorResult {
  const services: ServiceScaffold[] = [];
  const allFiles: GeneratedFile[] = [];
  let uiCount = 0;

  // Generate kernel scaffold if configured (project-level)
  if (config.project.kernel) {
    const scaffold = generateKernelScaffold(config.project.kernel, config);
    services.push(scaffold);
    allFiles.push(...scaffold.files);
  }

  for (const network of config.project.networks || []) {
    // Generate container scaffolds
    for (const container of network.containers || []) {
      const scaffold = generateContainerScaffold(container, config);
      services.push(scaffold);
      allFiles.push(...scaffold.files);
    }

    // Generate function scaffolds
    for (const func of network.functions || []) {
      const scaffold = generateFunctionScaffold(func, config);
      services.push(scaffold);
      allFiles.push(...scaffold.files);
    }

    // Generate UI scaffolds
    for (const ui of network.uis || []) {
      const scaffold = generateUIScaffold(ui, config);
      services.push(scaffold);
      allFiles.push(...scaffold.files);
      uiCount++;
    }
  }

  return { services, files: allFiles, uiCount };
}
