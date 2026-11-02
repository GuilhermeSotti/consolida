import { existsSync } from 'node:fs';

/**
 * Loads `.env` for local development only (Node >= 20.12 `process.loadEnvFile`). Variables
 * already present in the environment win; production never reads files.
 */
export function loadLocalEnvFile(path = '.env'): void {
  if (process.env.NODE_ENV === 'production' || !existsSync(path)) return;
  process.loadEnvFile(path);
}
