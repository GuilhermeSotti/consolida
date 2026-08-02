'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, getStoredAuthToken } from '../lib/api';

type DashboardSummary = {
  message?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getStoredAuthToken()) {
      router.replace('/login');
      return;
    }

    apiGet<DashboardSummary>('/auth/me')
      .then((response) => setSummary(response))
      .catch(() => setSummary({ message: 'Não foi possível carregar o usuário atual.' }))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="grid">
      <div className="card">
        <h1>Dashboard</h1>
        <p className="muted">Resumo operacional do motor de consolidação.</p>
        {loading ? <p>Carregando...</p> : <pre className="code">{JSON.stringify(summary, null, 2)}</pre>}
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2>Regras</h2>
          <p className="muted">Crie, ajuste e ative regras de negócio.</p>
          <Link href="/rules">Abrir gestão de regras</Link>
        </div>
        <div className="card">
          <h2>Execuções</h2>
          <p className="muted">Dispare consolidações, acompanhe status e visualize os resultados.</p>
          <Link href="/executions">Ir para execuções</Link>
        </div>
      </div>
    </div>
  );
}
