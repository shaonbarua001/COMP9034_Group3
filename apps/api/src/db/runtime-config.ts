export type SupabaseConfig = {
  enabled: boolean;
  dbUrl?: string;
  apiUrl?: string;
  serviceRoleKey?: string;
};

export function loadSupabaseConfig(env: NodeJS.ProcessEnv): SupabaseConfig {
  return {
    enabled: env.SUPABASE_ENABLED === 'true',
    dbUrl: env.DATABASE_URL || env.DB_URL,
    apiUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

// ✅ SAFE DB RESOLVER (IMPORTANT FIX)
export function resolveDbConnectionString(env: NodeJS.ProcessEnv): string | null {
  const raw =
    env.DATABASE_URL ||
    env.DB_URL ||
    null;

  if (!raw) return null;

  // remove accidental quotes/spaces (VERY COMMON IN RAILWAY)
  return raw.trim().replace(/^["']|["']$/g, '');
}