'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '../lib/api';

type Rule = {
  id: string;
  name: string;
  description?: string;
  status?: string;
  priority?: number;
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const loadRules = async () => {
    const response = await apiGet<{ items?: Rule[] }>('/rules');
    setRules(response.items ?? []);
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiPost('/rules', {
        name,
        description,
        sourceIds: [],
        conditions: { type: 'AND', conditions: [] },
        actions: { type: 'UPDATE_STATUS', payload: { status: 'APPROVED' } },
      });
      setName('');
      setDescription('');
      await loadRules();
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (rule: Rule) => {
    await apiPatch(`/rules/${rule.id}/${rule.status === 'ACTIVE' ? 'deactivate' : 'activate'}`);
    await loadRules();
  };

  return (
    <div className="grid">
      <div className="card">
        <h1>Regras</h1>
        <p className="muted">Gerencie regras de validação e automação.</p>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Nome
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Descrição
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Criar regra'}</button>
        </form>
      </div>
      <div className="card">
        <h2>Regras cadastradas</h2>
        <div className="list">
          {rules.map((rule) => (
            <div key={rule.id} className="list-item">
              <strong>{rule.name}</strong>
              <p className="muted">{rule.description ?? 'Sem descrição'}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <span>{rule.status ?? 'ACTIVE'}</span>
                <button type="button" className="secondary" onClick={() => void toggleRule(rule)}>
                  {rule.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
