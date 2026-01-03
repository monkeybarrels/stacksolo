/**
 * Project Store
 *
 * Reactive store for project state in the web admin.
 */

import { writable, derived } from 'svelte/store';

/** Resource status */
export type ResourceStatus = 'running' | 'stopped' | 'pending' | 'error' | 'unknown';

/** A cloud resource in the project */
export interface Resource {
  id: string;
  type: string;
  name: string;
  status: ResourceStatus;
  provider: string;
  region?: string;
  url?: string;
  createdAt?: string;
}

/** Project status from CLI */
export interface ProjectStatus {
  name: string;
  provider: string;
  projectId: string;
  region: string;
  resources: Resource[];
  lastDeployed?: string;
}

/** Deployment record */
export interface Deployment {
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string;
  message?: string;
}

/** Local dev service */
export interface LocalService {
  name: string;
  status: 'running' | 'stopped' | 'starting' | 'error';
  port?: number;
  url?: string;
  uptime?: number;
}

/** Local dev status */
export interface LocalDevStatus {
  running: boolean;
  services: LocalService[];
  cpu?: number;
  memory?: number;
  uptime?: number;
}

// Stores
export const projectStatus = writable<ProjectStatus | null>(null);
export const deployments = writable<Deployment[]>([]);
export const localDevStatus = writable<LocalDevStatus | null>(null);
export const isLoading = writable(false);
export const error = writable<string | null>(null);

// Derived stores
export const resourceCounts = derived(projectStatus, ($status) => {
  if (!$status) {
    return {
      functions: 0,
      containers: 0,
      databases: 0,
      storage: 0,
      cache: 0,
      loadBalancers: 0,
    };
  }

  const counts = {
    functions: 0,
    containers: 0,
    databases: 0,
    storage: 0,
    cache: 0,
    loadBalancers: 0,
  };

  for (const resource of $status.resources) {
    const type = resource.type.toLowerCase();
    if (type.includes('function')) counts.functions++;
    else if (type.includes('container') || type.includes('run')) counts.containers++;
    else if (type.includes('sql') || type.includes('database') || type.includes('firestore')) counts.databases++;
    else if (type.includes('bucket') || type.includes('storage')) counts.storage++;
    else if (type.includes('redis') || type.includes('memcache') || type.includes('cache')) counts.cache++;
    else if (type.includes('loadbalancer') || type.includes('lb')) counts.loadBalancers++;
  }

  return counts;
});

export const isLocalDevRunning = derived(localDevStatus, ($status) => $status?.running ?? false);

// Actions
export function clearError() {
  error.set(null);
}

export function setLoading(loading: boolean) {
  isLoading.set(loading);
}
