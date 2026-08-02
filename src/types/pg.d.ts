declare module 'pg' {
  export interface QueryResult {
    rows: unknown[];
  }

  export class Pool {
    constructor(config?: unknown);
    query(queryText: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }
}
