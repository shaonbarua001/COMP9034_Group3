import type { Queryable } from '../db/types.js';

export interface SupabaseConfig {
  enabled: boolean;
  dbUrl?: string;
  apiUrl?: string;
  restUrl?: string;
  serviceRoleKey?: string;
}

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
}

/**
 * 🔍 Check Supabase status (DB + REST)
 */
export async function getSupabaseStatus(
  db: Queryable,
  config: SupabaseConfig
): Promise<SupabaseStatus> {
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
    }
  };

  // ✅ DB CHECK
  try {
    const result = await db.query<{ ok: number }>('SELECT 1 AS ok');
    status.db.reachable = true;
    status.db.details = `probe=${result.rows[0]?.ok}`;
  } catch (err) {
    status.db.error = err instanceof Error ? err.message : 'db_failed';
  }

  // ✅ REST CHECK (IMPORTANT: query real table)
  if (config.apiUrl && config.serviceRoleKey) {
    try {
      const restBase = (config.restUrl ?? `${config.apiUrl}/rest/v1`).replace(/\/+$/, '');

      const res = await fetch(`${restBase}/users?select=id&limit=1`, {
        method: 'GET',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        }
      });

      if (res.ok) {
        status.rest.reachable = true;
        status.rest.details = `status=${res.status}`;
      } else {
        const text = await res.text();
        status.rest.error = `status=${res.status} body=${text.slice(0, 120)}`;
      }
    } catch (err) {
      status.rest.error = err instanceof Error ? err.message : 'rest_failed';
    }
  }

  return status;
}

/**
 * 📥 Insert data into Supabase
 */
export async function insertUser(config: SupabaseConfig, payload: {
  name: string;
  email: string;
}) {
  if (!config.apiUrl || !config.serviceRoleKey) {
    throw new Error('Supabase REST not configured');
  }

  const restBase = (config.restUrl ?? `${config.apiUrl}/rest/v1`).replace(/\/+$/, '');

  const res = await fetch(`${restBase}/users`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert failed: ${res.status} ${text}`);
  }

  return res.json();
}