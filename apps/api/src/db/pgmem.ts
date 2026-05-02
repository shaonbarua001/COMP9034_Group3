import { newDb } from 'pg-mem';
import type { Queryable, QueryResult } from './types.js';

export function createPgMemDb(): Queryable {
  const mem = newDb();

  // 🧠 IMPORTANT: optional compatibility settings
  mem.public.noneToAny = true;

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  return {
    async query<T = unknown>(
      text: string,
      params: unknown[] = []
    ): Promise<QueryResult<T>> {
      try {
        const result = await pool.query<T>(text, params);
        return { rows: result.rows };
      } catch (err) {
        console.error('[pg-mem error]', err);
        throw err;
      }
    },

    async close(): Promise<void> {
      await pool.end();
    }
  };
}