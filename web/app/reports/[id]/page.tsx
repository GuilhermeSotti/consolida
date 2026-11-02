'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/components/providers';
import { RowsTable } from '@/components/rows-table';
import { Button, ErrorAlert, Loading, Pagination, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { Report, Row } from '@/lib/types';

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const report = useResource(() => api.get<Report>(`/reports/${id}`), `report-${id}`);
  const rows = useResource(() => api.page<Row>(`/reports/${id}/rows`, { page, pageSize: 50 }), `report-rows-${id}-${page}`);
  const download = useAction();

  if (report.loading && !report.data) return <Loading />;
  if (!report.data) return <ErrorAlert error={report.error} />;
  const current = report.data;
  return (
    <>
      <p>
        <Link href="/reports">← Relatórios</Link>
      </p>
      <h1>{current.name}</h1>
      <p className="muted">
        {formatNumber(current.rowCount)} linhas · disponível em {formatDateTime(current.availableAt)} · execução{' '}
        <Link href={`/executions/${current.executionId}`}>{current.executionId.slice(0, 8)}</Link> · motor v{current.execution.engineVersion} ·{' '}
        {current.execution.rules.length} versão(ões) de regra
      </p>
      {can('reports:export') && (
        <p className="toolbar">
          <Button disabled={download.pending} onClick={() => void download.run(() => api.download(`/reports/${id}/export`, { format: 'csv' }))}>
            Exportar CSV
          </Button>
          <Button variant="secondary" disabled={download.pending} onClick={() => void download.run(() => api.download(`/reports/${id}/export`, { format: 'xlsx' }))}>
            Exportar XLSX
          </Button>
        </p>
      )}
      <ErrorAlert error={download.error} />
      <Section title="Linhas">
        {rows.loading && <Loading />}
        <ErrorAlert error={rows.error} />
        {rows.data && <RowsTable columns={current.columns} rows={rows.data.items} />}
        <Pagination metadata={rows.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
