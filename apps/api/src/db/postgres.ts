import { Pool } from 'pg';
import type { Queryable, QueryResult } from './types.js';

export class PostgresDb implements Queryable {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query<T = unknown>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(text, params);
    return { rows: result.rows };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
