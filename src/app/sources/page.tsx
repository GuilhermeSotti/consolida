'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

type Source = {
  id: string;
  name: string;
  description?: string;
  type: string;
  status?: string;
};

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('EXCEL');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const loadSources = async () => {
    const response = await apiGet<{ items?: Source[] }>('/sources');
    setSources(response.items ?? []);
  };

  useEffect(() => {
    void loadSources();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiPost('/sources', { name, type, description, config: {} });
      setName('');
      setDescription('');
      setType('EXCEL');
      await loadSources();
    } finally {
      setLoading(false);
    }
  };

  const deactivateSource = async (source: Source) => {
    await apiPatch(`/sources/${source.id}/deactivate`);
    await loadSources();
  };

  return (
    <div className="grid">
      <div className="card">
        <h1>Fontes</h1>
        <p className="muted">Cadastre e mantenha as fontes de dados do pipeline.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Nome
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Tipo
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="EXCEL">Excel</option>
              <option value="SQL">SQL</option>
              <option value="SHAREPOINT">SharePoint</option>
            </select>
          </label>
          <label>
            Descrição
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Criar fonte'}</button>
        </form>
      </div>
      <div className="card">
        <h2>Fontes cadastradas</h2>
        <div className="list">
          {sources.map((source) => (
            <div key={source.id} className="list-item">
              <strong>{source.name}</strong>
              <p className="muted">{source.type}</p>
              <p>{source.description ?? 'Sem descrição'}</p>
              <button type="button" className="secondary" onClick={() => void deactivateSource(source)}>
                Desativar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
