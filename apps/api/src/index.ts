import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrations.js';
import { createPgMemDb } from './db/pgmem.js';
import { PostgresDb } from './db/postgres.js';
import {
  loadSupabaseConfig,
  resolveDbConnectionString
} from './lib/runtime-config.js';

const basePath = process.env.API_BASE_PATH ?? '/api/v1';
const serverPort = Number(process.env.API_PORT ?? 4000);
const serverHost = process.env.API_HOST ?? '0.0.0.0';
const authSecret = process.env.API_AUTH_SECRET ?? 'local-dev-secret';

const supabase = loadSupabaseConfig(process.env);

function createRuntimeDb() {
  const connectionString = resolveDbConnectionString(process.env);

  if (!connectionString) {
    console.warn('No DATABASE_URL → using in-memory DB');
    return createPgMemDb();
  }

  // extra safety layer
  try {
    new URL(connectionString);
  } catch {
    throw new Error(`Invalid DATABASE_URL format: ${connectionString}`);
  }

  return new PostgresDb(connectionString);
}

async function bootstrap() {
  const db = createRuntimeDb();

  await runMigrations(db);

  const app = createApp({
    db,
    basePath,
    authSecret,
    supabase
  });

  app.listen(serverPort, serverHost, () => {
    console.log(
      `API running at http://${serverHost}:${serverPort}${basePath}`
    );
  });
}

bootstrap().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});