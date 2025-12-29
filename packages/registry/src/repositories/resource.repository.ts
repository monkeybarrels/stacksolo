/**
 * Resource repository - CRUD operations for resources in the registry
 */

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import type {
  RegistryResource,
  CreateResourceInput,
  UpdateResourceInput,
  ResourceLogicalType,
  ResourceStatus,
  ResourceOutputs,
} from '../types.js';

/**
 * Convert database row to RegistryResource
 */
function toResource(row: {
  id: string;
  project_id: string;
  type: string;
  name: string;
  network: string | null;
  resource_type: string;
  config: string;
  outputs: string | null;
  status: string;
  pulumi_urn: string | null;
  last_deployed_at: string | null;
  created_at: string;
  updated_at: string;
}): RegistryResource {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as ResourceLogicalType,
    name: row.name,
    network: row.network,
    resourceType: row.resource_type,
    config: JSON.parse(row.config),
    outputs: row.outputs ? JSON.parse(row.outputs) : null,
    status: row.status as ResourceStatus,
    pulumiUrn: row.pulumi_urn,
    lastDeployedAt: row.last_deployed_at ? new Date(row.last_deployed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class ResourceRepository {
  /**
   * Create a new resource
   */
  async create(input: CreateResourceInput): Promise<RegistryResource> {
    const db = getDb();
    const now = new Date().toISOString();
    const id = uuidv4();

    const row = {
      id,
      project_id: input.projectId,
      type: input.type,
      name: input.name,
      network: input.network ?? null,
      resource_type: input.resourceType,
      config: JSON.stringify(input.config),
      outputs: null,
      status: 'pending',
      pulumi_urn: null,
      last_deployed_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto('resources').values(row).execute();

    return toResource(row);
  }

  /**
   * Find a resource by ID
   */
  async findById(id: string): Promise<RegistryResource | null> {
    const db = getDb();
    const row = await db
      .selectFrom('resources')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    return row ? toResource(row) : null;
  }

  /**
   * Find resources by project ID
   */
  async findByProjectId(projectId: string): Promise<RegistryResource[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('resources')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map(toResource);
  }

  /**
   * Find resources by project ID and network
   */
  async findByProjectAndNetwork(
    projectId: string,
    network: string
  ): Promise<RegistryResource[]> {
    const db = getDb();
    const rows = await db
      .selectFrom('resources')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('network', '=', network)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map(toResource);
  }

  /**
   * Find a resource by reference (project name, network, resource name)
   * Used for cross-project reference resolution
   */
  async findByReference(
    projectId: string,
    resourceName: string,
    network?: string | null
  ): Promise<RegistryResource | null> {
    const db = getDb();

    let query = db
      .selectFrom('resources')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('name', '=', resourceName);

    if (network !== undefined && network !== null) {
      query = query.where('network', '=', network);
    }

    const row = await query.executeTakeFirst();
    return row ? toResource(row) : null;
  }

  /**
   * Find a resource by name within a project
   */
  async findByName(projectId: string, name: string): Promise<RegistryResource | null> {
    const db = getDb();
    const row = await db
      .selectFrom('resources')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('name', '=', name)
      .executeTakeFirst();

    return row ? toResource(row) : null;
  }

  /**
   * Update a resource
   */
  async update(id: string, input: UpdateResourceInput): Promise<RegistryResource> {
    const db = getDb();
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.type !== undefined) updates.type = input.type;
    if (input.name !== undefined) updates.name = input.name;
    if (input.network !== undefined) updates.network = input.network;
    if (input.resourceType !== undefined) updates.resource_type = input.resourceType;
    if (input.config !== undefined) updates.config = JSON.stringify(input.config);
    if (input.outputs !== undefined) updates.outputs = JSON.stringify(input.outputs);
    if (input.status !== undefined) updates.status = input.status;
    if (input.pulumiUrn !== undefined) updates.pulumi_urn = input.pulumiUrn;
    if (input.lastDeployedAt !== undefined) {
      updates.last_deployed_at = input.lastDeployedAt.toISOString();
    }

    await db.updateTable('resources').set(updates).where('id', '=', id).execute();

    const resource = await this.findById(id);
    if (!resource) {
      throw new Error(`Resource not found: ${id}`);
    }

    return resource;
  }

  /**
   * Update resource outputs
   */
  async updateOutputs(id: string, outputs: ResourceOutputs): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .updateTable('resources')
      .set({
        outputs: JSON.stringify(outputs),
        status: 'ready',
        last_deployed_at: now,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Update resource status
   */
  async updateStatus(id: string, status: ResourceStatus): Promise<void> {
    const db = getDb();
    const now = new Date().toISOString();

    await db
      .updateTable('resources')
      .set({
        status,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Upsert resources for a project
   * Updates existing resources or creates new ones
   */
  async upsert(projectId: string, resources: CreateResourceInput[]): Promise<void> {
    for (const input of resources) {
      const existing = await this.findByName(projectId, input.name);

      if (existing) {
        await this.update(existing.id, {
          type: input.type,
          network: input.network,
          resourceType: input.resourceType,
          config: input.config,
        });
      } else {
        await this.create(input);
      }
    }
  }

  /**
   * Delete a resource
   */
  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.deleteFrom('resources').where('id', '=', id).execute();
  }

  /**
   * Delete all resources for a project
   */
  async deleteByProjectId(projectId: string): Promise<void> {
    const db = getDb();
    await db.deleteFrom('resources').where('project_id', '=', projectId).execute();
  }
}
