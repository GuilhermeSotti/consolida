'use client';

import { FormEvent, useState } from 'react';
import { apiPost } from '../lib/api';

export default function ExecutionsPage() {
  const [configurationId, setConfigurationId] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await apiPost('/executions/run', { configurationId });
      setResult(response);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid">
      <div className="card">
        <h1>Execuções</h1>
        <p className="muted">Dispare uma nova consolidação para uma configuração específica.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            ID da configuração
            <input value={configurationId} onChange={(event) => setConfigurationId(event.target.value)} required />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Executando...' : 'Executar consolidação'}</button>
        </form>
      </div>
      <div className="card">
        <h2>Resultado</h2>
        {result ? <pre className="code">{JSON.stringify(result, null, 2)}</pre> : <p className="muted">Ainda sem execução.</p>}
      </div>
    </div>
  );
}
