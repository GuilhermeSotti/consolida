'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { useSession } from '@/components/providers';
import { Button, Empty, ErrorAlert, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { DataImport, Source } from '@/lib/types';

export default function SourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const source = useResource(() => api.get<Source>(`/sources/${id}`), `source-${id}`);
  const imports = useResource(() => api.page<DataImport>(`/sources/${id}/imports`, { page, pageSize: 20 }), `imports-${id}-${page}`);
  const action = useAction();
  const fileInput = useRef<HTMLInputElement>(null);

  async function toggleStatus(current: Source) {
    const updated = await action.run(() => api.post<Source>(`/sources/${id}/${current.status === 'ACTIVE' ? 'deactivate' : 'activate'}`));
    if (updated) source.reload();
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    const created = await action.run(() => api.upload<DataImport>(`/sources/${id}/imports`, file));
    if (created && fileInput.current) fileInput.current.value = '';
    imports.reload();
  }

  if (source.loading && !source.data) return <Loading />;
  if (!source.data) return <ErrorAlert error={source.error} />;
  const current = source.data;
  return (
    <>
      <p>
        <Link href="/sources">← Fontes</Link>
      </p>
      <h1>
        {current.code} — {current.name} <StatusBadge status={current.status} />
      </h1>
      <ErrorAlert error={action.error} />
      <Section
        title="Configuração"
        actions={
          can('sources:update') && (
            <Button variant="secondary" disabled={action.pending} onClick={() => void toggleStatus(current)}>
              {current.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
            </Button>
          )
        }
      >
        <dl className="details">
          <dt>Formato</dt>
          <dd>
            {current.fileFormat}
            {current.fileFormat === 'XLSX' ? ` (aba: ${current.sheetName ?? 'primeira'})` : ` (separador: ${current.csvDelimiter ?? 'automático'})`}
          </dd>
          <dt>Colunas esperadas</dt>
          <dd>{current.expectedColumns.map((column) => `${column.name}${column.required ? '' : ' (opcional)'}`).join(', ') || '—'}</dd>
          <dt>Metadados</dt>
          <dd>{Object.entries(current.metadata).map(([key, value]) => `${key}: ${value}`).join(' · ') || '—'}</dd>
          <dt>Descrição</dt>
          <dd>{current.description ?? '—'}</dd>
        </dl>
      </Section>
      {can('sources:import') && current.status === 'ACTIVE' && (
        <Section title="Enviar arquivo">
          <form className="inline" onSubmit={upload}>
            <input ref={fileInput} type="file" required accept={current.fileFormat === 'CSV' ? '.csv,.txt,text/csv' : '.xlsx'} aria-label="Arquivo da carga" />
            <Button type="submit" disabled={action.pending}>
              {action.pending ? 'Enviando…' : 'Enviar'}
            </Button>
          </form>
          <p className="muted">A validação ocorre em segundo plano; você será notificado ao final.</p>
        </Section>
      )}
      <Section title="Cargas" actions={<Button variant="secondary" onClick={imports.reload}>Atualizar</Button>}>
        {imports.loading && <Loading />}
        <ErrorAlert error={imports.error} />
        {imports.data?.items.length === 0 && <Empty>Nenhuma carga enviada.</Empty>}
        {imports.data && imports.data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Arquivo</th>
                <th scope="col">Status</th>
                <th scope="col">Linhas</th>
                <th scope="col">Tamanho</th>
                <th scope="col">Recebida em</th>
              </tr>
            </thead>
            <tbody>
              {imports.data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/imports/${item.id}`}>{item.fileName}</Link>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{formatNumber(item.rowCount)}</td>
                  <td>{formatBytes(item.fileSizeBytes)}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination metadata={imports.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
