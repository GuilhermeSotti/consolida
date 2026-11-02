'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/components/providers';
import { RULE_TEMPLATES } from '@/components/rule-templates';
import { Button, ErrorAlert, Field, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { Rule, RuleVersion } from '@/lib/types';

export default function RuleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const rule = useResource(() => api.get<Rule>(`/rules/${id}`), `rule-${id}`);
  const versions = useResource(() => api.page<RuleVersion>(`/rules/${id}/versions`, { page, pageSize: 10 }), `rule-versions-${id}-${page}`);
  const action = useAction();

  async function toggle(current: Rule) {
    const updated = await action.run(() => api.post<Rule>(`/rules/${id}/${current.status === 'ACTIVE' ? 'deactivate' : 'activate'}`));
    if (updated) rule.reload();
  }

  if (rule.loading && !rule.data) return <Loading />;
  if (!rule.data) return <ErrorAlert error={rule.error} />;
  const current = rule.data;
  return (
    <>
      <p>
        <Link href="/rules">← Regras</Link>
      </p>
      <h1>
        {current.current.name} <StatusBadge status={current.status} />
      </h1>
      <p className="muted">
        {RULE_TEMPLATES[current.type].label} · versão {current.currentVersion} · fase {current.current.phase ?? 'todas'} · ordem {current.current.executionOrder}
      </p>
      <ErrorAlert error={action.error} />
      {can('rules:activate') && (
        <p>
          <Button variant={current.status === 'ACTIVE' ? 'danger' : 'primary'} disabled={action.pending} onClick={() => void toggle(current)}>
            {current.status === 'ACTIVE' ? 'Desativar regra' : 'Ativar regra'}
          </Button>
        </p>
      )}
      {can('rules:update') ? (
        <EditRule key={current.currentVersion} rule={current} onSaved={() => (rule.reload(), versions.reload())} />
      ) : (
        <Section title="Definição atual">
          <pre className="code">{JSON.stringify(current.current.definition, null, 2)}</pre>
        </Section>
      )}
      <Section title="Histórico de versões (imutável)">
        <ol className="list">
          {versions.data?.items.map((version) => (
            <li key={version.id}>
              <strong>v{version.version}</strong> — {version.name} · {formatDateTime(version.createdAt)}
              {version.changeReason && <> · motivo: {version.changeReason}</>}
              <details>
                <summary>Definição</summary>
                <pre className="code">{JSON.stringify(version.definition, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ol>
        <Pagination metadata={versions.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}

function EditRule({ rule, onSaved }: { rule: Rule; onSaved: () => void }) {
  const action = useAction();
  const [name, setName] = useState(rule.current.name);
  const [phase, setPhase] = useState(rule.current.phase ?? '');
  const [executionOrder, setExecutionOrder] = useState(String(rule.current.executionOrder));
  const [definition, setDefinition] = useState(JSON.stringify(rule.current.definition, null, 2));
  const [changeReason, setChangeReason] = useState('');
  const [jsonError, setJsonError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(definition);
      setJsonError(undefined);
    } catch {
      setJsonError('A definição não é um JSON válido.');
      return;
    }
    const saved = await action.run(() =>
      api.patch<Rule>(`/rules/${rule.id}`, {
        expectedVersion: rule.currentVersion,
        name,
        phase: phase || null,
        executionOrder: Number(executionOrder),
        definition: parsed,
        changeReason,
      }),
    );
    if (saved) onSaved();
  }

  return (
    <Section title={`Nova versão (a partir da v${rule.currentVersion})`}>
      <form className="grid" onSubmit={submit}>
        <Field label="Nome">
          <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Fase">
          <input maxLength={100} value={phase} onChange={(event) => setPhase(event.target.value)} />
        </Field>
        <Field label="Ordem de execução">
          <input type="number" min={0} max={1000000} value={executionOrder} onChange={(event) => setExecutionOrder(event.target.value)} />
        </Field>
        <Field label="Definição (JSON)">
          <textarea className="code" rows={12} value={definition} onChange={(event) => setDefinition(event.target.value)} spellCheck={false} />
        </Field>
        <Field label="Motivo da alteração" hint="Obrigatório (fica no histórico e na auditoria)">
          <input required minLength={3} maxLength={500} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
        </Field>
        <div>
          <Button type="submit" disabled={action.pending}>
            {action.pending ? 'Salvando…' : 'Salvar nova versão'}
          </Button>
        </div>
      </form>
      <ErrorAlert message={jsonError} title="Definição inválida" />
      <ErrorAlert error={action.error} />
    </Section>
  );
}
