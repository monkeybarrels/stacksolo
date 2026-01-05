/**
 * Helm Output Formatter
 *
 * Transforms resolved K8s resources into a complete Helm chart
 */

import type { OutputFormatter, OutputFormatterOptions, GeneratedOutput } from '@stacksolo/core';
import {
  generateChartYaml,
  generateHelpersTpl,
  generateValuesYaml,
  generateNamespaceTemplate,
  generateConfigMapTemplate,
  generateDeploymentTemplate,
  generateServiceTemplate,
  generateIngressTemplate,
} from './templates/index';
import type { HelmChartConfig } from './types';

export const helmFormatter: OutputFormatter = {
  id: 'helm',
  name: 'Helm Chart',
  description: 'Generates a Helm chart with templatized Kubernetes manifests',

  generate(options: OutputFormatterOptions): GeneratedOutput[] {
    const { projectName, resources, config } = options;
    const helmConfig = config as HelmChartConfig;

    const chartName = projectName;
    const chartVersion = helmConfig?.chartVersion || '0.1.0';
    const appVersion = helmConfig?.appVersion || 'latest';

    // Extract registry URL from resources for values.yaml
    const deploymentResource = resources.find(r => r.type === 'k8s:deployment');
    const image = deploymentResource?.config?.image as string;
    const defaultRegistry = image ? image.split('/').slice(0, -1).join('/') : undefined;

    const outputs: GeneratedOutput[] = [];

    // Chart.yaml
    outputs.push({
      path: 'Chart.yaml',
      content: generateChartYaml({
        name: chartName,
        version: chartVersion,
        appVersion,
      }),
    });

    // values.yaml
    outputs.push({
      path: 'values.yaml',
      content: generateValuesYaml({
        chartName,
        resources,
        defaultRegistry,
      }),
    });

    // templates/_helpers.tpl
    outputs.push({
      path: 'templates/_helpers.tpl',
      content: generateHelpersTpl(chartName),
    });

    // templates/namespace.yaml
    outputs.push({
      path: 'templates/namespace.yaml',
      content: generateNamespaceTemplate(chartName),
    });

    // templates/configmap.yaml
    outputs.push({
      path: 'templates/configmap.yaml',
      content: generateConfigMapTemplate(chartName),
    });

    // templates/deployment.yaml
    outputs.push({
      path: 'templates/deployment.yaml',
      content: generateDeploymentTemplate(chartName),
    });

    // templates/service.yaml
    outputs.push({
      path: 'templates/service.yaml',
      content: generateServiceTemplate(chartName),
    });

    // templates/ingress.yaml
    outputs.push({
      path: 'templates/ingress.yaml',
      content: generateIngressTemplate(chartName),
    });

    return outputs;
  },
};
