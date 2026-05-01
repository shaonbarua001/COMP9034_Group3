import { newDb } from 'pg-mem';
import type { Queryable, QueryResult } from './types.js';

export function createPgMemDb(): Queryable {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();

  return {
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
      const result = await pool.query<T>(text, params);
      return { rows: result.rows };
    },
    async close(): Promise<void> {
      await pool.end();
    }
  };
}
