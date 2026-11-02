'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorAlert, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { RowsTable } from '@/components/rows-table';
import { api } from '@/lib/api';
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format';
import { useResource } from '@/lib/hooks';
import type { DataImport, Row } from '@/lib/types';

export default function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const item = useResource(() => api.get<DataImport>(`/imports/${id}`), `import-${id}`);
  const validated = item.data?.status === 'VALIDATED';
  const rows = useResource(
    () => (validated ? api.page<Row>(`/imports/${id}/rows`, { page, pageSize: 50 }) : Promise.resolve(undefined)),
    `import-rows-${id}-${page}-${validated}`,
  );
  if (item.loading && !item.data) return <Loading />;
  if (!item.data) return <ErrorAlert error={item.error} />;
  const current = item.data;
  return (
    <>
      <p>
        <Link href={`/sources/${current.sourceId}`}>← Fonte</Link>
      </p>
      <h1>
        {current.fileName} <StatusBadge status={current.status} />
      </h1>
      <Section title="Resumo">
        <dl className="details">
          <dt>Linhas</dt>
          <dd>{formatNumber(current.rowCount)}</dd>
          <dt>Tamanho</dt>
          <dd>{formatBytes(current.fileSizeBytes)}</dd>
          <dt>SHA-256</dt>
          <dd>
            <code>{current.checksumSha256}</code>
          </dd>
          <dt>Recebida / processada</dt>
          <dd>
            {formatDateTime(current.createdAt)} / {formatDateTime(current.processedAt)}
          </dd>
          <dt>Colunas</dt>
          <dd>{current.columns?.map((column) => column.name).join(', ') ?? '—'}</dd>
        </dl>
      </Section>
      {current.validationErrors && current.validationErrors.length > 0 && (
        <Section title="Problemas encontrados">
          <ul className="list">
            {current.validationErrors.map((issue, index) => (
              <li key={index}>
                {issue.field && <code>{issue.field}</code>} {issue.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {validated && (
        <Section title="Prévia das linhas normalizadas">
          {rows.loading && <Loading />}
          <ErrorAlert error={rows.error} />
          {rows.data && <RowsTable columns={current.columns?.map((column) => column.name) ?? []} rows={rows.data.items} />}
          <Pagination metadata={rows.data?.metadata} onPage={setPage} />
        </Section>
      )}
    </>
  );
}
