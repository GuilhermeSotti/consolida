import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class SqlLoaderService {
  private pools = new Map<string, Pool>();

  private getPool(conn: Record<string, any>): Pool {
    const key = `${conn.host}:${conn.port}:${conn.database}:${conn.user}`;
    if (this.pools.has(key)) return this.pools.get(key)!;

    const pool = new Pool({
      host: conn.host,
      port: conn.port,
      database: conn.database,
      user: conn.user,
      password: conn.password,
      max: conn.max || 5,
    });

    this.pools.set(key, pool);
    return pool;
  }

  async query(connectionConfig: Record<string, unknown>, sql: string): Promise<any[]> {
    const conn = connectionConfig as Record<string, any>;
    if (!conn.host || !conn.database) throw new Error('Invalid connection config for SQL loader');

    const pool = this.getPool(conn);
    const res = await pool.query(sql);
    return res.rows;
  }
}
