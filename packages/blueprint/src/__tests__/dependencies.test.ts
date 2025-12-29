import { describe, it, expect } from 'vitest';
import {
  buildDependencyGraph,
  detectCycles,
  topologicalSort,
  getParallelBatches,
  getDependencies,
  getDependents,
} from '../dependencies';
import type { ResolvedResource } from '../schema';

function makeResource(id: string, dependsOn: string[] = []): ResolvedResource {
  return {
    id,
    type: 'gcp:test',
    name: id,
    config: {},
    dependsOn,
  };
}

describe('buildDependencyGraph', () => {
  it('should build graph with no dependencies', () => {
    const resources = [
      makeResource('a'),
      makeResource('b'),
      makeResource('c'),
    ];

    const graph = buildDependencyGraph(resources);

    expect(graph.size).toBe(3);
    expect(graph.get('a')?.dependencies.size).toBe(0);
    expect(graph.get('b')?.dependencies.size).toBe(0);
  });

  it('should build graph with dependencies', () => {
    const resources = [
      makeResource('a'),
      makeResource('b', ['a']),
      makeResource('c', ['a', 'b']),
    ];

    const graph = buildDependencyGraph(resources);

    expect(graph.get('b')?.dependencies.has('a')).toBe(true);
    expect(graph.get('c')?.dependencies.has('a')).toBe(true);
    expect(graph.get('c')?.dependencies.has('b')).toBe(true);

    expect(graph.get('a')?.dependents.has('b')).toBe(true);
    expect(graph.get('a')?.dependents.has('c')).toBe(true);
    expect(graph.get('b')?.dependents.has('c')).toBe(true);
  });

  it('should ignore non-existent dependencies', () => {
    const resources = [
      makeResource('a', ['non-existent']),
    ];

    const graph = buildDependencyGraph(resources);

    expect(graph.get('a')?.dependencies.size).toBe(0);
  });
});

describe('detectCycles', () => {
  it('should return null for acyclic graph', () => {
    const resources = [
      makeResource('a'),
      makeResource('b', ['a']),
      makeResource('c', ['b']),
    ];

    const graph = buildDependencyGraph(resources);
    const cycle = detectCycles(graph);

    expect(cycle).toBeNull();
  });

  it('should detect direct cycle', () => {
    const resources = [
      makeResource('a', ['b']),
      makeResource('b', ['a']),
    ];

    const graph = buildDependencyGraph(resources);
    const cycle = detectCycles(graph);

    expect(cycle).not.toBeNull();
    expect(cycle).toContain('a');
    expect(cycle).toContain('b');
  });

  it('should detect indirect cycle', () => {
    const resources = [
      makeResource('a', ['c']),
      makeResource('b', ['a']),
      makeResource('c', ['b']),
    ];

    const graph = buildDependencyGraph(resources);
    const cycle = detectCycles(graph);

    expect(cycle).not.toBeNull();
  });
});

describe('topologicalSort', () => {
  it('should sort independent resources', () => {
    const resources = [
      makeResource('c'),
      makeResource('a'),
      makeResource('b'),
    ];

    const order = topologicalSort(resources);

    expect(order).toHaveLength(3);
    expect(order).toContain('a');
    expect(order).toContain('b');
    expect(order).toContain('c');
  });

  it('should sort dependent resources correctly', () => {
    const resources = [
      makeResource('c', ['b']),
      makeResource('a'),
      makeResource('b', ['a']),
    ];

    const order = topologicalSort(resources);

    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('should handle complex dependencies', () => {
    const resources = [
      makeResource('e', ['c', 'd']),
      makeResource('d', ['b']),
      makeResource('c', ['a', 'b']),
      makeResource('b', ['a']),
      makeResource('a'),
    ];

    const order = topologicalSort(resources);

    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('e'));
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('e'));
  });

  it('should throw on circular dependency', () => {
    const resources = [
      makeResource('a', ['b']),
      makeResource('b', ['a']),
    ];

    expect(() => topologicalSort(resources)).toThrow('Circular dependency');
  });
});

describe('getParallelBatches', () => {
  it('should put independent resources in same batch', () => {
    const resources = [
      makeResource('a'),
      makeResource('b'),
      makeResource('c'),
    ];

    const batches = getParallelBatches(resources);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  it('should separate dependent resources into different batches', () => {
    const resources = [
      makeResource('a'),
      makeResource('b', ['a']),
      makeResource('c', ['b']),
    ];

    const batches = getParallelBatches(resources);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toContain('a');
    expect(batches[1]).toContain('b');
    expect(batches[2]).toContain('c');
  });

  it('should maximize parallelism', () => {
    const resources = [
      makeResource('a'),
      makeResource('b'),
      makeResource('c', ['a']),
      makeResource('d', ['b']),
      makeResource('e', ['c', 'd']),
    ];

    const batches = getParallelBatches(resources);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toContain('a');
    expect(batches[0]).toContain('b');
    expect(batches[1]).toContain('c');
    expect(batches[1]).toContain('d');
    expect(batches[2]).toContain('e');
  });
});

describe('getDependencies', () => {
  it('should return direct dependencies', () => {
    const resources = [
      makeResource('a'),
      makeResource('b'),
      makeResource('c', ['a', 'b']),
    ];

    const deps = getDependencies(resources, 'c');

    expect(deps).toHaveLength(2);
    expect(deps.map(d => d.id)).toContain('a');
    expect(deps.map(d => d.id)).toContain('b');
  });

  it('should return empty for resource with no dependencies', () => {
    const resources = [makeResource('a')];

    const deps = getDependencies(resources, 'a');

    expect(deps).toHaveLength(0);
  });
});

describe('getDependents', () => {
  it('should return direct dependents', () => {
    const resources = [
      makeResource('a'),
      makeResource('b', ['a']),
      makeResource('c', ['a']),
    ];

    const dependents = getDependents(resources, 'a');

    expect(dependents).toHaveLength(2);
    expect(dependents.map(d => d.id)).toContain('b');
    expect(dependents.map(d => d.id)).toContain('c');
  });
});
