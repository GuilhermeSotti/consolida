'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorAlert, Loading, Pagination, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useResource } from '@/lib/hooks';
import type { Report } from '@/lib/types';

export default function ReportsPage() {
  const [page, setPage] = useState(1);
  const reports = useResource(() => api.page<Report>('/reports', { page, pageSize: 20 }), `reports-${page}`);
  return (
    <>
      <h1>Relatórios Consolidados</h1>
      <Section title="Disponíveis">
        {reports.loading && <Loading />}
        <ErrorAlert error={reports.error} />
        {reports.data?.items.length === 0 && <Empty>Nenhum relatório gerado ainda.</Empty>}
        {reports.data && reports.data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Relatório</th>
                <th scope="col">Linhas</th>
                <th scope="col">Fase</th>
                <th scope="col">Disponível em</th>
              </tr>
            </thead>
            <tbody>
              {reports.data.items.map((report) => (
                <tr key={report.id}>
                  <td>
                    <Link href={`/reports/${report.id}`}>{report.name}</Link>
                  </td>
                  <td>{formatNumber(report.rowCount)}</td>
                  <td>{report.execution.phase ?? '—'}</td>
                  <td>{formatDateTime(report.availableAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination metadata={reports.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
