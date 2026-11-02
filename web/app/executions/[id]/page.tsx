'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/providers';
import { Button, ErrorAlert, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api, newIdempotencyKey } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { Execution, ExecutionLog } from '@/lib/types';

const ACTIVE = new Set(['QUEUED', 'RUNNING']);

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const execution = useResource(() => api.get<Execution>(`/executions/${id}`), `execution-${id}`);
  const logs = useResource(() => api.page<ExecutionLog>(`/executions/${id}/logs`, { page, pageSize: 50 }), `execution-logs-${id}-${page}`);
  const action = useAction();
  const running = execution.data ? ACTIVE.has(execution.data.status) : false;
  const { reload: reloadExecution } = execution;
  const { reload: reloadLogs } = logs;

  // Follow the progress while the execution is queued or running.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      reloadExecution();
      reloadLogs();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [running, reloadExecution, reloadLogs]);

  async function cancel() {
    if (await action.run(() => api.post<Execution>(`/executions/${id}/cancel`))) execution.reload();
  }

  async function rerun() {
    const created = await action.run(() => api.post<Execution>(`/executions/${id}/rerun`, undefined, { 'Idempotency-Key': newIdempotencyKey('rerun') }));
    if (created) router.push(`/executions/${created.id}`);
  }

  if (execution.loading && !execution.data) return <Loading />;
  if (!execution.data) return <ErrorAlert error={execution.error} />;
  const current = execution.data;
  return (
    <>
      <p>
        <Link href="/executions">← Execuções</Link>
      </p>
      <h1>
        Execução {current.id.slice(0, 8)} <StatusBadge status={current.status} />
      </h1>
      <ErrorAlert error={action.error} />
      <p className="toolbar">
        {can('executions:cancel') && running && !current.cancelRequested && (
          <Button variant="danger" disabled={action.pending} onClick={() => void cancel()}>
            Cancelar
          </Button>
        )}
        {can('executions:run') && !running && (
          <Button variant="secondary" disabled={action.pending} onClick={() => void rerun()}>
            Reprocessar com as mesmas entradas
          </Button>
        )}
        {current.reportId && can('reports:view') && <Link href={`/reports/${current.reportId}`}>Abrir Relatório Consolidado</Link>}
      </p>
      <Section title="Resumo">
        <dl className="details">
          <dt>Progresso</dt>
          <dd>
            {current.progress ? `${current.progress.stage} — ${current.progress.rulesApplied}/${current.progress.totalRules} regras` : '—'}
            {current.cancelRequested && running ? ' (cancelamento solicitado)' : ''}
          </dd>
          <dt>Linhas</dt>
          <dd>
            {formatNumber(current.rowsIn)} → {formatNumber(current.rowsOut)}
          </dd>
          <dt>Fase</dt>
          <dd>{current.phase ?? '—'}</dd>
          <dt>Motor</dt>
          <dd>v{current.engineVersion}</dd>
          <dt>Datas</dt>
          <dd>
            solicitada {formatDateTime(current.createdAt)} · início {formatDateTime(current.startedAt)} · fim {formatDateTime(current.finishedAt)}
          </dd>
          {current.errorCode && (
            <>
              <dt>Erro</dt>
              <dd>
                <code>{current.errorCode}</code> {current.errorMessage}
              </dd>
            </>
          )}
          <dt>Entradas fixadas</dt>
          <dd>
            carga <Link href={`/imports/${current.inputSnapshot.primaryImportId}`}>{current.inputSnapshot.primaryImportId.slice(0, 8)}</Link>
            {' · '}
            {current.inputSnapshot.rules.length} versão(ões) de regra
            {current.reproducedFromId && (
              <>
                {' · '}reprocessamento de <Link href={`/executions/${current.reproducedFromId}`}>{current.reproducedFromId.slice(0, 8)}</Link>
              </>
            )}
          </dd>
        </dl>
      </Section>
      <Section title="Logs">
        <ErrorAlert error={logs.error} />
        <ol className="log">
          {logs.data?.items.map((log) => (
            <li key={log.id} className={`log-${log.level.toLowerCase()}`}>
              <span className="muted">{formatDateTime(log.occurredAt)}</span> <strong>{log.step}</strong> {log.message}
            </li>
          ))}
        </ol>
        <Pagination metadata={logs.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
