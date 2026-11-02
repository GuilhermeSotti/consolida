'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/components/providers';
import { Button, Empty, ErrorAlert, Field, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api, newIdempotencyKey } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { Execution, Source } from '@/lib/types';

export default function ExecutionsPage() {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const executions = useResource(() => api.page<Execution>('/executions', { page, pageSize: 20, status }), `executions-${page}-${status}`);
  const sources = useResource(() => api.page<Source>('/sources', { pageSize: 100, status: 'ACTIVE' }), 'executions-sources');
  const sourceCode = (id: string) => sources.data?.items.find((source) => source.id === id)?.code ?? id.slice(0, 8);
  return (
    <>
      <h1>Execuções</h1>
      {can('executions:run') && <RequestExecution sources={sources.data?.items ?? []} />}
      <Section
        title="Histórico"
        actions={
          <>
            <label>
              Status{' '}
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos</option>
                {['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" onClick={executions.reload}>
              Atualizar
            </Button>
          </>
        }
      >
        {executions.loading && <Loading />}
        <ErrorAlert error={executions.error} />
        {executions.data?.items.length === 0 && <Empty>Nenhuma execução.</Empty>}
        {executions.data && executions.data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Execução</th>
                <th scope="col">Fonte</th>
                <th scope="col">Fase</th>
                <th scope="col">Status</th>
                <th scope="col">Linhas</th>
                <th scope="col">Solicitada em</th>
                <th scope="col">Concluída em</th>
              </tr>
            </thead>
            <tbody>
              {executions.data.items.map((execution) => (
                <tr key={execution.id}>
                  <td>
                    <Link href={`/executions/${execution.id}`}>{execution.id.slice(0, 8)}</Link>
                  </td>
                  <td>{sourceCode(execution.sourceId)}</td>
                  <td>{execution.phase ?? '—'}</td>
                  <td>
                    <StatusBadge status={execution.status} />
                  </td>
                  <td>
                    {formatNumber(execution.rowsIn)} → {formatNumber(execution.rowsOut)}
                  </td>
                  <td>{formatDateTime(execution.createdAt)}</td>
                  <td>{formatDateTime(execution.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination metadata={executions.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}

function RequestExecution({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const action = useAction();
  const [sourceId, setSourceId] = useState('');
  const [phase, setPhase] = useState('');
  // One key per form submission intent: double clicks and retries do not create duplicates.
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey('exec'));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const execution = await action.run(() => api.post<Execution>('/executions', { sourceId, phase: phase || null }, { 'Idempotency-Key': idempotencyKey }));
    if (execution) {
      setIdempotencyKey(newIdempotencyKey('exec'));
      router.push(`/executions/${execution.id}`);
    }
  }

  return (
    <Section title="Nova execução">
      <form className="grid" onSubmit={submit}>
        <Field label="Fonte" hint="Usa a carga validada mais recente e as regras ativas (versões fixadas no pedido)">
          <select required value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            <option value="">Selecione…</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.code} — {source.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fase" hint="Opcional: inclui também as regras desta fase">
          <input maxLength={100} value={phase} onChange={(event) => setPhase(event.target.value)} />
        </Field>
        <div>
          <Button type="submit" disabled={action.pending}>
            {action.pending ? 'Enviando…' : 'Executar'}
          </Button>
        </div>
      </form>
      <ErrorAlert error={action.error} />
    </Section>
  );
}
