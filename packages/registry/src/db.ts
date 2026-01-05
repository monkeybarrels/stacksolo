/**
 * Registry database connection
 * Stores data at ~/.stacksolo/registry.db
 */

import { Kysely, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { RegistryDatabase } from './schema.js';

// Registry directory and database location
const STACKSOLO_DIR = join(homedir(), '.stacksolo');
const DB_PATH = process.env.STACKSOLO_REGISTRY_PATH || join(STACKSOLO_DIR, 'registry.db');

let dbInstance: Kysely<RegistryDatabase> | null = null;

/**
 * Get or create the registry database connection
 */
export function getDb(): Kysely<RegistryDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure directory exists
  const dbDir = join(DB_PATH, '..');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const dialect = new SqliteDialect({
    database: new SQLite(DB_PATH),
  });

  dbInstance = new Kysely<RegistryDatabase>({
    dialect,
  });

  return dbInstance;
}

/**
 * Initialize the database schema
 * Creates tables if they don't exist
 */
export async function initRegistry(): Promise<void> {
  const db = getDb();

  // Create projects table
  await db.schema
    .createTable('projects')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('gcp_project_id', 'text', (col) => col.notNull())
    .addColumn('region', 'text', (col) => col.notNull())
    .addColumn('config_path', 'text')
    .addColumn('config_hash', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('last_deployed_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // Create resources table
  await db.schema
    .createTable('resources')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('network', 'text')
    .addColumn('resource_type', 'text', (col) => col.notNull())
    .addColumn('config', 'text', (col) => col.notNull())
    .addColumn('outputs', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('pulumi_urn', 'text')
    .addColumn('last_deployed_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // Create deployments table
  await db.schema
    .createTable('deployments')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('config_snapshot', 'text', (col) => col.notNull())
    .addColumn('log_path', 'text')
    .addColumn('error', 'text')
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('completed_at', 'text')
    .execute();

  // Create indexes for common queries
  await db.schema
    .createIndex('idx_resources_project')
    .ifNotExists()
    .on('resources')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('idx_resources_lookup')
    .ifNotExists()
    .on('resources')
    .columns(['project_id', 'network', 'name'])
    .execute();

  await db.schema
    .createIndex('idx_deployments_project')
    .ifNotExists()
    .on('deployments')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('idx_projects_gcp')
    .ifNotExists()
    .on('projects')
    .column('gcp_project_id')
    .execute();

  // Create sessions table for event logging
  await db.schema
    .createTable('sessions')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('finished_at', 'text')
    .addColumn('command', 'text', (col) => col.notNull())
    .addColumn('args', 'text')
    .addColumn('config_hash', 'text')
    .addColumn('project_name', 'text')
    .addColumn('gcp_project_id', 'text')
    .addColumn('exit_code', 'integer')
    .execute();

  // Create events table for high resolution event stream
  await db.schema
    .createTable('events')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('sessions.id').onDelete('cascade')
    )
    .addColumn('timestamp', 'text', (col) => col.notNull())
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('project', 'text')
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('event_type', 'text', (col) => col.notNull())
    .addColumn('resource_type', 'text')
    .addColumn('resource_name', 'text')
    .addColumn('terraform_address', 'text')
    .addColumn('data', 'text', (col) => col.notNull())
    .addColumn('parent_event_id', 'integer')
    .addColumn('correlation_id', 'text')
    .execute();

  // Create indexes for event queries
  await db.schema
    .createIndex('idx_events_session')
    .ifNotExists()
    .on('events')
    .columns(['session_id', 'seq'])
    .execute();

  await db.schema
    .createIndex('idx_events_timestamp')
    .ifNotExists()
    .on('events')
    .column('timestamp')
    .execute();

  await db.schema
    .createIndex('idx_events_resource')
    .ifNotExists()
    .on('events')
    .column('resource_name')
    .execute();

  await db.schema
    .createIndex('idx_events_correlation')
    .ifNotExists()
    .on('events')
    .column('correlation_id')
    .execute();

  await db.schema
    .createIndex('idx_events_type')
    .ifNotExists()
    .on('events')
    .columns(['category', 'event_type'])
    .execute();

  await db.schema
    .createIndex('idx_events_project')
    .ifNotExists()
    .on('events')
    .column('project')
    .execute();
}

/**
 * Close the database connection
 */
export async function closeRegistry(): Promise<void> {
  if (dbInstance) {
    await dbInstance.destroy();
    dbInstance = null;
  }
}

/**
 * Get the registry directory path
 */
export function getRegistryDir(): string {
  return STACKSOLO_DIR;
}

/**
 * Get the registry database path
 */
export function getRegistryDbPath(): string {
  return DB_PATH;
}

export type { RegistryDatabase } from './schema.js';
