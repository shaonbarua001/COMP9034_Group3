export interface SupabaseConfig {
  enabled: boolean;
  apiUrl?: string;
  dbUrl?: string;
  restUrl?: string;
  graphqlUrl?: string;
  functionsUrl?: string;
  studioUrl?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

export function resolveDbConnectionString(env: NodeJS.ProcessEnv): string | undefined {
  return env.DATABASE_URL ?? env.DB_URL ?? undefined;
}

export function loadSupabaseConfig(env: NodeJS.ProcessEnv): SupabaseConfig {
  const apiUrl = env.API_URL;
  const dbUrl = env.DB_URL;
  const restUrl = env.REST_URL;
  const graphqlUrl = env.GRAPHQL_URL;
  const functionsUrl = env.FUNCTIONS_URL;
  const studioUrl = env.STUDIO_URL;
  const anonKey = env.ANON_KEY;
  const serviceRoleKey = env.SERVICE_ROLE_KEY;

  const enabled = Boolean(apiUrl && dbUrl && restUrl && anonKey && serviceRoleKey);

  return {
    enabled,
    apiUrl,
    dbUrl,
    restUrl,
    graphqlUrl,
    functionsUrl,
    studioUrl,
    anonKey,
    serviceRoleKey
  };
}
