/**
 * Conflict detection for merged projects
 */

import type { StackSoloConfig } from '../schema.js';

export interface Conflict {
  type: 'error' | 'warning';
  category: 'gcp_project' | 'region' | 'resource_name' | 'bucket_name' | 'backend';
  message: string;
  sources: string[]; // Project names involved
  resource?: string; // Resource name if applicable
}

export interface ConflictResult {
  hasErrors: boolean;
  conflicts: Conflict[];
}

/**
 * Detect conflicts between multiple project configs
 */
export function detectConflicts(
  configs: Array<{ name: string; config: StackSoloConfig }>
): ConflictResult {
  const conflicts: Conflict[] = [];

  // Check GCP project IDs match
  const gcpProjects = new Map<string, string[]>();
  for (const { name, config } of configs) {
    const gcpId = config.project.gcpProjectId;
    if (!gcpProjects.has(gcpId)) {
      gcpProjects.set(gcpId, []);
    }
    gcpProjects.get(gcpId)!.push(name);
  }

  if (gcpProjects.size > 1) {
    conflicts.push({
      type: 'error',
      category: 'gcp_project',
      message: `All projects must use the same GCP project ID. Found: ${Array.from(gcpProjects.keys()).join(', ')}`,
      sources: configs.map(c => c.name),
    });
  }

  // Check regions match
  const regions = new Map<string, string[]>();
  for (const { name, config } of configs) {
    const region = config.project.region;
    if (!regions.has(region)) {
      regions.set(region, []);
    }
    regions.get(region)!.push(name);
  }

  if (regions.size > 1) {
    conflicts.push({
      type: 'warning',
      category: 'region',
      message: `Projects use different regions: ${Array.from(regions.entries()).map(([r, ps]) => `${r} (${ps.join(', ')})`).join('; ')}. Resources will be deployed to their original regions.`,
      sources: configs.map(c => c.name),
    });
  }

  // Check backends match
  const backends = new Map<string, string[]>();
  for (const { name, config } of configs) {
    const backend = config.project.backend || 'cdktf';
    if (!backends.has(backend)) {
      backends.set(backend, []);
    }
    backends.get(backend)!.push(name);
  }

  if (backends.size > 1) {
    conflicts.push({
      type: 'error',
      category: 'backend',
      message: `All projects must use the same backend. Found: ${Array.from(backends.entries()).map(([b, ps]) => `${b} (${ps.join(', ')})`).join('; ')}`,
      sources: configs.map(c => c.name),
    });
  }

  // Check for bucket name conflicts (globally unique)
  const buckets = new Map<string, string[]>();
  for (const { name, config } of configs) {
    for (const bucket of config.project.buckets || []) {
      if (!buckets.has(bucket.name)) {
        buckets.set(bucket.name, []);
      }
      buckets.get(bucket.name)!.push(name);
    }
  }

  for (const [bucketName, sources] of buckets) {
    if (sources.length > 1) {
      conflicts.push({
        type: 'error',
        category: 'bucket_name',
        message: `Bucket name "${bucketName}" is used by multiple projects`,
        sources,
        resource: bucketName,
      });
    }
  }

  // Check for secret name conflicts
  const secrets = new Map<string, string[]>();
  for (const { name, config } of configs) {
    for (const secret of config.project.secrets || []) {
      if (!secrets.has(secret.name)) {
        secrets.set(secret.name, []);
      }
      secrets.get(secret.name)!.push(name);
    }
  }

  for (const [secretName, sources] of secrets) {
    if (sources.length > 1) {
      conflicts.push({
        type: 'warning',
        category: 'resource_name',
        message: `Secret name "${secretName}" is used by multiple projects. Will be prefixed.`,
        sources,
        resource: secretName,
      });
    }
  }

  // Check for topic name conflicts
  const topics = new Map<string, string[]>();
  for (const { name, config } of configs) {
    for (const topic of config.project.topics || []) {
      if (!topics.has(topic.name)) {
        topics.set(topic.name, []);
      }
      topics.get(topic.name)!.push(name);
    }
  }

  for (const [topicName, sources] of topics) {
    if (sources.length > 1) {
      conflicts.push({
        type: 'warning',
        category: 'resource_name',
        message: `Topic name "${topicName}" is used by multiple projects. Will be prefixed.`,
        sources,
        resource: topicName,
      });
    }
  }

  return {
    hasErrors: conflicts.some(c => c.type === 'error'),
    conflicts,
  };
}

/**
 * Format conflicts for display
 */
export function formatConflicts(result: ConflictResult): string {
  const lines: string[] = [];

  const errors = result.conflicts.filter(c => c.type === 'error');
  const warnings = result.conflicts.filter(c => c.type === 'warning');

  if (errors.length > 0) {
    lines.push('Errors:');
    for (const error of errors) {
      lines.push(`  - ${error.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of warnings) {
      lines.push(`  - ${warning.message}`);
    }
  }

  return lines.join('\n');
}
