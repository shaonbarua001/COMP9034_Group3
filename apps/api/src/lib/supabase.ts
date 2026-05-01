import type { Queryable } from '../db/types.js';
import type { SupabaseConfig } from './runtime-config.js';

export interface SupabaseStatus {
  enabled: boolean;
  mode: 'disabled' | 'local_supabase';
  db: {
    configured: boolean;
    reachable: boolean;
    details?: string;
    error?: string;
  };
  rest: {
    configured: boolean;
    reachable: boolean;
    details?: string;
    error?: string;
  };
  endpoints: {
    apiUrl?: string;
    restUrl?: string;
    graphqlUrl?: string;
    functionsUrl?: string;
    studioUrl?: string;
  };
}

export async function getSupabaseStatus(db: Queryable, config: SupabaseConfig): Promise<SupabaseStatus> {
  const status: SupabaseStatus = {
    enabled: config.enabled,
    mode: config.enabled ? 'local_supabase' : 'disabled',
    db: {
      configured: Boolean(config.dbUrl),
      reachable: false
    },
    rest: {
      configured: Boolean(config.apiUrl && config.serviceRoleKey),
      reachable: false
    },
    endpoints: {
      apiUrl: config.apiUrl,
      restUrl: config.restUrl,
      graphqlUrl: config.graphqlUrl,
      functionsUrl: config.functionsUrl,
      studioUrl: config.studioUrl
    }
  };

  try {
    const dbProbe = await db.query<{ ok: number }>('SELECT 1 AS ok');
    status.db.reachable = true;
    status.db.details = `probe=${dbProbe.rows[0]?.ok ?? 0}`;
  } catch (error) {
    status.db.error = error instanceof Error ? error.message : 'db_probe_failed';
  }

  if (config.apiUrl && config.serviceRoleKey) {
    try {
      const restBase = (config.restUrl ?? `${config.apiUrl}/rest/v1`).replace(/\/+$/, '');
      const response = await fetch(`${restBase}/`, {
        method: 'GET',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        }
      });

      if (response.ok) {
        status.rest.reachable = true;
        status.rest.details = `status=${response.status}`;
      } else {
        const text = await response.text();
        status.rest.error = `status=${response.status} body=${text.slice(0, 160)}`;
      }
    } catch (error) {
      status.rest.error = error instanceof Error ? error.message : 'rest_probe_failed';
    }
  }

  return status;
}
