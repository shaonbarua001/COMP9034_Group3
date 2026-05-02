import { Pool } from 'pg';
import type { Queryable, QueryResult } from './types.js';

export class PostgresDb implements Queryable {
  private pool: Pool;

  constructor(connectionString: string) {
    if (!connectionString) {
      throw new Error('DATABASE_URL is missing');
    }

    // HARD VALIDATION (prevents pg crash)
    try {
      new URL(connectionString);
    } catch {
      throw new Error(`Invalid DATABASE_URL: ${connectionString}`);
    }

    this.pool = new Pool({ connectionString });
  }

  async query<T = unknown>(
    text: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const result = await this.pool.query<T>(text, params);
    return { rows: result.rows };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}