import type { ErrorDetail } from '../../../shared/domain/errors';
import { isControlCharacter } from '../../../shared/domain/text';

export const SOURCE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const FILE_FORMATS = ['CSV', 'XLSX'] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

/** Only file uploads exist in the MVP; remote connectors require an allow-list and vault-held credentials first. */
export const SOURCE_ORIGINS = ['FILE_UPLOAD'] as const;
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

export const SOURCE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;
export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;

export const FILE_EXTENSIONS: Readonly<Record<FileFormat, readonly string[]>> = {
  CSV: ['.csv', '.txt'],
  XLSX: ['.xlsx'],
};

const METADATA_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/** Keys that suggest credentials or connection secrets are refused (metadata is returned by the API). */
const CREDENTIAL_KEY = /(password|passwd|pwd|senha|secret|token|credential|apikey|api_key|connection_?string|connstr)/i;

/**
 * Business metadata of a source (e.g. empresa, fornecedor, fase): flat string map,
 * at most 50 keys. Never credentials — connectors will reference a vault instead.
 */
export function parseSourceMetadata(input: unknown, field = 'metadata'): { metadata: Record<string, string>; issues: ErrorDetail[] } {
  const issues: ErrorDetail[] = [];
  if (input === undefined || input === null) return { metadata: {}, issues };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { metadata: {}, issues: [{ field, message: 'Deve ser um objeto de pares chave/valor.', code: 'INVALID_TYPE' }] };
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 50) issues.push({ field, message: 'No máximo 50 chaves.', code: 'TOO_LONG' });
  const metadata: Record<string, string> = {};
  for (const [key, value] of entries.slice(0, 50)) {
    if (!METADATA_KEY.test(key)) {
      issues.push({ field: `${field}.${key}`, message: 'Chave inválida (letras, dígitos e _; até 64).', code: 'INVALID_FORMAT' });
    } else if (CREDENTIAL_KEY.test(key)) {
      issues.push({ field: `${field}.${key}`, message: 'Metadados não podem conter credenciais.', code: 'FORBIDDEN_KEY' });
    } else if (typeof value !== 'string' || value.length > 500) {
      issues.push({ field: `${field}.${key}`, message: 'O valor deve ser um texto de até 500 caracteres.', code: 'INVALID_TYPE' });
    } else {
      metadata[key] = value.trim();
    }
  }
  return { metadata, issues };
}

const FILE_NAME_RESERVED = new Set(['"', '<', '>', '|', ':', '*', '?']);

/**
 * Keeps only the base name (no path segments), replaces control and reserved characters with "_"
 * and limits the result to 255 characters (code points, matching the database column).
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const safe = Array.from(base, (char) => (isControlCharacter(char) || FILE_NAME_RESERVED.has(char) ? '_' : char));
  return Array.from(safe.join('').trim()).slice(0, 255).join('');
}

export function hasAllowedExtension(fileName: string, format: FileFormat): boolean {
  const lower = fileName.toLowerCase();
  return FILE_EXTENSIONS[format].some((extension) => lower.endsWith(extension));
}

/** Cheap content sniffing: XLSX is a ZIP container; CSV must not contain NUL bytes. */
export function looksLike(format: FileFormat, content: Uint8Array): boolean {
  if (format === 'XLSX') {
    return content.length > 4 && content[0] === 0x50 && content[1] === 0x4b && content[2] === 0x03 && content[3] === 0x04;
  }
  const sample = content.subarray(0, Math.min(content.length, 64 * 1024));
  return !sample.includes(0);
}
