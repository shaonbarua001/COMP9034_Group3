export interface QueryResult<T = unknown> {
  rows: T[];
}

export interface Queryable {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  close?(): Promise<void>;
}
