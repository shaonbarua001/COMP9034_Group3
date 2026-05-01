import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/migrations.js';
import { createPgMemDb } from './db/pgmem.js';
import { PostgresDb } from './db/postgres.js';
import { loadSupabaseConfig, resolveDbConnectionString } from './lib/runtime-config.js';

const basePath = process.env.API_BASE_PATH ?? '/api/v1';
const serverPort = Number(process.env.API_PORT ?? 4000);
const serverHost = process.env.API_HOST ?? '0.0.0.0';
const authSecret = process.env.API_AUTH_SECRET ?? 'local-dev-secret';
const supabase = loadSupabaseConfig(process.env);

function createRuntimeDb() {
  const connectionString = resolveDbConnectionString(process.env);
  if (!connectionString) {
    // eslint-disable-next-line no-console
    console.warn('DATABASE_URL/DB_URL not set, using in-memory database for local runtime.');
    return createPgMemDb();
  }
  return new PostgresDb(connectionString);
}

async function bootstrap() {
  const db = createRuntimeDb();
  await runMigrations(db);

  const app = createApp({ db, basePath, authSecret, supabase });

  app.listen(serverPort, serverHost, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://${serverHost}:${serverPort}${basePath}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void bootstrap();
}
