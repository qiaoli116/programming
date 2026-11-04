import fs from 'node:fs';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import * as init from './migrations/001_init';
import * as profiles from './migrations/002_profiles';

// Migrations are listed in code so the same list works under tsx, Vitest and a production build.
const migrations: Record<string, { up: (db: Knex) => Promise<void>; down: (db: Knex) => Promise<void> }> = {
  '001_init': init,
  '002_profiles': profiles,
};

export function createDb(filename: string): Knex {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  return knex({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    // One connection: simple, and required for an in-memory database. SQLite ignores foreign keys unless asked.
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: { pragma: (sql: string) => void }, done: (err: Error | null, conn: unknown) => void) => {
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
  });
}

export async function migrate(db: Knex): Promise<void> {
  await db.migrate.latest({
    migrationSource: {
      getMigrations: async () => Object.keys(migrations),
      getMigrationName: (name: string) => name,
      getMigration: async (name: unknown) => migrations[name as string],
    },
  });
}
