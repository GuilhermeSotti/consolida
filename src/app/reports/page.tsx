'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

type Report = {
  id: string;
  status?: string;
  type?: string;
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    apiGet<{ items?: Report[] }>('/reports')
      .then((response) => setReports(response.items ?? []))
      .catch(() => setReports([]));
  }, []);

  return (
    <div className="grid">
      <div className="card">
        <h1>Relatórios</h1>
        <p className="muted">Consulte os relatórios consolidados persistidos pelo backend.</p>
      </div>
      <div className="card">
        <h2>Relatórios disponíveis</h2>
        <div className="list">
          {reports.length === 0 ? (
            <p className="muted">Nenhum relatório encontrado.</p>
          ) : (
            reports.map((report) => (
              <div key={report.id} className="list-item">
                <strong>{report.id}</strong>
                <p>Status: {report.status ?? 'N/A'}</p>
                <p>Tipo: {report.type ?? 'N/A'}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
