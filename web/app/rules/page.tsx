'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/components/providers';
import { RULE_TEMPLATES } from '@/components/rule-templates';
import { Button, Empty, ErrorAlert, Field, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import { RULE_TYPES, type Rule, type RuleType, type Source } from '@/lib/types';

export default function RulesPage() {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const rules = useResource(() => api.page<Rule>('/rules', { page, pageSize: 20, status }), `rules-${page}-${status}`);
  const sources = useResource(() => api.page<Source>('/sources', { pageSize: 100 }), 'rules-sources');
  const sourceName = (id: string) => sources.data?.items.find((source) => source.id === id)?.code ?? id.slice(0, 8);

  return (
    <>
      <h1>Regras de negócio</h1>
      {can('rules:create') && <CreateRule sources={sources.data?.items ?? []} onCreated={rules.reload} />}
      <Section
        title="Regras"
        actions={
          <label>
            Status{' '}
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="ACTIVE">Ativas</option>
              <option value="INACTIVE">Inativas</option>
            </select>
          </label>
        }
      >
        {rules.loading && <Loading />}
        <ErrorAlert error={rules.error} />
        {rules.data?.items.length === 0 && <Empty>Nenhuma regra encontrada.</Empty>}
        {rules.data && rules.data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col">Fonte</th>
                <th scope="col">Fase</th>
                <th scope="col">Ordem</th>
                <th scope="col">Versão</th>
                <th scope="col">Status</th>
                <th scope="col">Atualizada em</th>
              </tr>
            </thead>
            <tbody>
              {rules.data.items.map((rule) => (
                <tr key={rule.id}>
                  <td>
                    <Link href={`/rules/${rule.id}`}>{rule.current.name}</Link>
                  </td>
                  <td>{RULE_TEMPLATES[rule.type].label}</td>
                  <td>{sourceName(rule.targetSourceId)}</td>
                  <td>{rule.current.phase ?? 'todas'}</td>
                  <td>{rule.current.executionOrder}</td>
                  <td>v{rule.currentVersion}</td>
                  <td>
                    <StatusBadge status={rule.status} />
                  </td>
                  <td>{formatDateTime(rule.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination metadata={rules.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}

function CreateRule({ sources, onCreated }: { sources: Source[]; onCreated: () => void }) {
  const action = useAction();
  const [type, setType] = useState<RuleType>('FILTER');
  const [targetSourceId, setTargetSourceId] = useState('');
  const [name, setName] = useState('');
  const [phase, setPhase] = useState('');
  const [executionOrder, setExecutionOrder] = useState('0');
  const [definition, setDefinition] = useState(JSON.stringify(RULE_TEMPLATES.FILTER.template, null, 2));
  const [jsonError, setJsonError] = useState<string>();

  function changeType(next: RuleType) {
    setType(next);
    setDefinition(JSON.stringify(RULE_TEMPLATES[next].template, null, 2));
  }

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
    const created = await action.run(() =>
      api.post<Rule>('/rules', { type, targetSourceId, name, phase: phase || null, executionOrder: Number(executionOrder), definition: parsed }),
    );
    if (created) {
      setName('');
      onCreated();
    }
  }

  return (
    <Section title="Nova regra (criada inativa; ative após revisar)">
      <form className="grid" onSubmit={submit}>
        <Field label="Tipo">
          <select value={type} onChange={(event) => changeType(event.target.value as RuleType)}>
            {RULE_TYPES.map((value) => (
              <option key={value} value={value}>
                {RULE_TEMPLATES[value].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fonte-alvo">
          <select required value={targetSourceId} onChange={(event) => setTargetSourceId(event.target.value)}>
            <option value="">Selecione…</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.code} — {source.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nome">
          <input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Fase" hint="Vazio = aplica-se a todas as execuções">
          <input maxLength={100} value={phase} onChange={(event) => setPhase(event.target.value)} />
        </Field>
        <Field label="Ordem de execução" hint="Dentro da mesma categoria de regra">
          <input type="number" min={0} max={1000000} value={executionOrder} onChange={(event) => setExecutionOrder(event.target.value)} />
        </Field>
        <Field label="Definição (JSON)" hint="Os nomes de colunas são convertidos para MAIÚSCULAS com _">
          <textarea className="code" rows={10} value={definition} onChange={(event) => setDefinition(event.target.value)} spellCheck={false} />
        </Field>
        <div>
          <Button type="submit" disabled={action.pending}>
            {action.pending ? 'Salvando…' : 'Criar regra'}
          </Button>
        </div>
      </form>
      <ErrorAlert message={jsonError} title="Definição inválida" />
      <ErrorAlert error={action.error} />
    </Section>
  );
}
