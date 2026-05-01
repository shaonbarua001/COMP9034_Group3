import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresDb } from './db/postgres.js';
import { resolveDbConnectionString } from './lib/runtime-config.js';

async function main(): Promise<void> {
  const connectionString = resolveDbConnectionString(process.env);
  if (!connectionString) {
    throw new Error('DATABASE_URL or DB_URL is required to run seed');
  }

  const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db');
  const cleanCreateSql = await fs.readFile(path.join(dbDir, 'clean_create.sql'), 'utf8');
  const seedSql = await fs.readFile(path.join(dbDir, 'seed.sql'), 'utf8');

  const db = new PostgresDb(connectionString);
  try {
    await db.query(cleanCreateSql);
    await db.query(seedSql);
    // eslint-disable-next-line no-console
    console.log('Database reset and seed completed successfully');
  } finally {
    await db.close();
  }
}

void main();
