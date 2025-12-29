/**
 * StackSolo Blueprint Dependencies
 * Build dependency graph and topologically sort resources
 */

import type { ResolvedResource, ResolvedConfig } from './schema.js';
import { extractDependencies } from './references.js';

/**
 * Dependency graph node
 */
interface GraphNode {
  id: string;
  resource: ResolvedResource;
  dependencies: Set<string>;
  dependents: Set<string>;
}

/**
 * Build a dependency graph from resolved resources
 */
export function buildDependencyGraph(resources: ResolvedResource[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();

  // Create nodes
  for (const resource of resources) {
    graph.set(resource.id, {
      id: resource.id,
      resource,
      dependencies: new Set(),
      dependents: new Set(),
    });
  }

  // Add edges
  for (const resource of resources) {
    const node = graph.get(resource.id)!;
    const deps = extractDependencies(resource);

    for (const depId of deps) {
      // Only add if the dependency exists
      if (graph.has(depId)) {
        node.dependencies.add(depId);
        graph.get(depId)!.dependents.add(resource.id);
      }
    }
  }

  return graph;
}

/**
 * Detect cycles in the dependency graph
 * Returns the cycle path if found, null otherwise
 */
export function detectCycles(graph: Map<string, GraphNode>): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = graph.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          // Found a cycle
          const cycleStart = path.indexOf(depId);
          path.push(depId); // Complete the cycle
          return true;
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  }

  for (const nodeId of graph.keys()) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) {
        return path;
      }
    }
  }

  return null;
}

/**
 * Topologically sort resources based on their dependencies
 * Returns resource IDs in the order they should be created
 */
export function topologicalSort(resources: ResolvedResource[]): string[] {
  const graph = buildDependencyGraph(resources);

  // Check for cycles
  const cycle = detectCycles(graph);
  if (cycle) {
    throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
  }

  const result: string[] = [];
  const visited = new Set<string>();

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.get(nodeId);
    if (node) {
      // Visit all dependencies first
      for (const depId of node.dependencies) {
        visit(depId);
      }
    }

    result.push(nodeId);
  }

  // Visit all nodes
  for (const nodeId of graph.keys()) {
    visit(nodeId);
  }

  return result;
}

/**
 * Get resources in creation order
 */
export function getResourcesInOrder(resolved: ResolvedConfig): ResolvedResource[] {
  const order = topologicalSort(resolved.resources);
  const resourceMap = new Map(resolved.resources.map(r => [r.id, r]));

  return order.map(id => resourceMap.get(id)!);
}

/**
 * Get resources that can be created in parallel (no dependencies on each other)
 * Returns arrays of resource IDs that can be created together
 */
export function getParallelBatches(resources: ResolvedResource[]): string[][] {
  const graph = buildDependencyGraph(resources);
  const batches: string[][] = [];
  const completed = new Set<string>();

  while (completed.size < resources.length) {
    const batch: string[] = [];

    for (const [id, node] of graph) {
      if (completed.has(id)) continue;

      // Check if all dependencies are completed
      const allDepsCompleted = [...node.dependencies].every(dep => completed.has(dep));
      if (allDepsCompleted) {
        batch.push(id);
      }
    }

    if (batch.length === 0 && completed.size < resources.length) {
      throw new Error('Unable to make progress - possible circular dependency');
    }

    batches.push(batch);
    batch.forEach(id => completed.add(id));
  }

  return batches;
}

/**
 * Get direct dependencies of a resource
 */
export function getDependencies(
  resources: ResolvedResource[],
  resourceId: string
): ResolvedResource[] {
  const graph = buildDependencyGraph(resources);
  const node = graph.get(resourceId);
  if (!node) return [];

  const resourceMap = new Map(resources.map(r => [r.id, r]));
  return [...node.dependencies]
    .map(id => resourceMap.get(id))
    .filter((r): r is ResolvedResource => r !== undefined);
}

/**
 * Get direct dependents of a resource (resources that depend on it)
 */
export function getDependents(
  resources: ResolvedResource[],
  resourceId: string
): ResolvedResource[] {
  const graph = buildDependencyGraph(resources);
  const node = graph.get(resourceId);
  if (!node) return [];

  const resourceMap = new Map(resources.map(r => [r.id, r]));
  return [...node.dependents]
    .map(id => resourceMap.get(id))
    .filter((r): r is ResolvedResource => r !== undefined);
}

/**
 * Get all transitive dependencies of a resource
 */
export function getTransitiveDependencies(
  resources: ResolvedResource[],
  resourceId: string
): ResolvedResource[] {
  const graph = buildDependencyGraph(resources);
  const visited = new Set<string>();
  const result: string[] = [];

  function collect(id: string) {
    if (visited.has(id)) return;
    visited.add(id);

    const node = graph.get(id);
    if (node) {
      for (const depId of node.dependencies) {
        collect(depId);
      }
    }

    if (id !== resourceId) {
      result.push(id);
    }
  }

  collect(resourceId);

  const resourceMap = new Map(resources.map(r => [r.id, r]));
  return result
    .map(id => resourceMap.get(id))
    .filter((r): r is ResolvedResource => r !== undefined);
}

/**
 * Resolve config with topologically sorted order
 */
export function resolveWithOrder(resolved: ResolvedConfig): ResolvedConfig {
  return {
    ...resolved,
    order: topologicalSort(resolved.resources),
  };
}
