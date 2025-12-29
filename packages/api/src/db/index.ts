import { Kysely, SqliteDialect } from 'kysely';
import SQLite from 'better-sqlite3';
import type { Database } from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database file location - in the api package for now
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../stacksolo.db');

const dialect = new SqliteDialect({
  database: new SQLite(dbPath),
});

export const db = new Kysely<Database>({
  dialect,
});

// Initialize database schema
export async function initDatabase(): Promise<void> {
  // Create projects table
  await db.schema
    .createTable('projects')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_config', 'text', (col) => col.notNull())
    .addColumn('path', 'text')
    .addColumn('pattern_id', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // Migration: Add path and pattern_id columns if they don't exist
  // This handles existing databases
  try {
    await db.schema
      .alterTable('projects')
      .addColumn('path', 'text')
      .execute();
  } catch {
    // Column already exists
  }
  try {
    await db.schema
      .alterTable('projects')
      .addColumn('pattern_id', 'text')
      .execute();
  } catch {
    // Column already exists
  }

  // Create resources table
  await db.schema
    .createTable('resources')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) => col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('config', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute();

  // Create deployments table
  await db.schema
    .createTable('deployments')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) => col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('finished_at', 'text')
    .addColumn('logs', 'text')
    .addColumn('error', 'text')
    .execute();

  // Create indexes
  await db.schema
    .createIndex('idx_resources_project_id')
    .ifNotExists()
    .on('resources')
    .column('project_id')
    .execute();

  await db.schema
    .createIndex('idx_deployments_project_id')
    .ifNotExists()
    .on('deployments')
    .column('project_id')
    .execute();
}

export type { Database } from './schema';
