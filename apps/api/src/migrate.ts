import 'dotenv/config';
import { PostgresDb } from './db/postgres.js';
import { runMigrations } from './db/migrations.js';
import { resolveDbConnectionString } from './lib/runtime-config.js';

async function main(): Promise<void> {
  const connectionString = resolveDbConnectionString(process.env);
  if (!connectionString) {
    throw new Error('DATABASE_URL or DB_URL is required to run migrations');
  }

  const db = new PostgresDb(connectionString);
  try {
    await runMigrations(db);
    // eslint-disable-next-line no-console
    console.log('Migrations completed successfully');
  } finally {
    await db.close();
  }
}

void main();
