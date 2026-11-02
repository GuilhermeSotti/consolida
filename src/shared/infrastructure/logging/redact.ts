/**
 * Removes secrets, personal data and bulk payloads from values before they are logged or stored
 * in audit details. Keys are matched case-insensitively.
 */
const SENSITIVE_KEY = /(authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|assertion|email|e-mail)/i;
const BULK_KEY = /^(content|buffer|rows|data|file|body)$/i;
const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
const MAX_STRING = 2000;

export const REDACTED = '[REDACTED]';

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (typeof value !== 'object') return undefined;
  if (depth >= MAX_DEPTH) return '[TRUNCATED]';
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return `[${(value as ArrayBufferView).byteLength} bytes]`;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`[+${value.length - MAX_ITEMS} itens]`);
    return items;
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) output[key] = REDACTED;
    else if (BULK_KEY.test(key) && typeof item === 'object' && item !== null) output[key] = '[OMITTED]';
    else output[key] = redact(item, depth + 1);
  }
  return output;
}
