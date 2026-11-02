const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const integer = new Intl.NumberFormat('pt-BR');

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '—';
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : integer.format(value);
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  RECEIVED: 'Recebida',
  PROCESSING: 'Processando',
  VALIDATED: 'Validada',
  REJECTED: 'Rejeitada',
  FAILED: 'Falhou',
  QUEUED: 'Na fila',
  RUNNING: 'Executando',
  SUCCEEDED: 'Concluída',
  CANCELLED: 'Cancelada',
  SUCCESS: 'Sucesso',
  FAILURE: 'Falha',
  DENIED: 'Negado',
};
