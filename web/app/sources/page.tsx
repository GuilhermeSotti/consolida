'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/components/providers';
import { Button, Empty, ErrorAlert, Field, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { FileFormat, Source } from '@/lib/types';

export default function SourcesPage() {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const sources = useResource(() => api.page<Source>('/sources', { page, pageSize: 20 }), `sources-${page}`);
  return (
    <>
      <h1>Fontes e cargas</h1>
      {can('sources:create') && <CreateSource onCreated={sources.reload} />}
      <Section title="Fontes cadastradas">
        {sources.loading && <Loading />}
        <ErrorAlert error={sources.error} />
        {sources.data?.items.length === 0 && <Empty>Nenhuma fonte cadastrada.</Empty>}
        {sources.data && sources.data.items.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nome</th>
                <th scope="col">Formato</th>
                <th scope="col">Colunas esperadas</th>
                <th scope="col">Status</th>
                <th scope="col">Atualizada em</th>
              </tr>
            </thead>
            <tbody>
              {sources.data.items.map((source) => (
                <tr key={source.id}>
                  <td>
                    <Link href={`/sources/${source.id}`}>{source.code}</Link>
                  </td>
                  <td>{source.name}</td>
                  <td>{source.fileFormat}</td>
                  <td>{source.expectedColumns.length}</td>
                  <td>
                    <StatusBadge status={source.status} />
                  </td>
                  <td>{formatDateTime(source.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination metadata={sources.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}

function CreateSource({ onCreated }: { onCreated: () => void }) {
  const action = useAction();
  const [form, setForm] = useState({ code: '', name: '', description: '', fileFormat: 'CSV' as FileFormat, sheetName: '', csvDelimiter: '', columns: '' });
  const update = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    const created = await action.run(() =>
      api.post<Source>('/sources', {
        code: form.code.trim().toUpperCase(),
        name: form.name,
        description: form.description || null,
        fileFormat: form.fileFormat,
        sheetName: form.fileFormat === 'XLSX' ? form.sheetName || null : null,
        csvDelimiter: form.fileFormat === 'CSV' ? form.csvDelimiter || null : null,
        expectedColumns: form.columns
          .split(/[\n,]/)
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ name, required: true })),
      }),
    );
    if (created) {
      setForm({ ...form, code: '', name: '', description: '', columns: '' });
      onCreated();
    }
  }

  return (
    <Section title="Nova fonte">
      <form className="grid" onSubmit={submit}>
        <Field label="Código" hint="Maiúsculas, dígitos, _ ou - (ex.: NOTAS_FISCAIS)">
          <input required value={form.code} onChange={update('code')} maxLength={64} />
        </Field>
        <Field label="Nome">
          <input required value={form.name} onChange={update('name')} maxLength={200} />
        </Field>
        <Field label="Formato">
          <select value={form.fileFormat} onChange={update('fileFormat')}>
            <option value="CSV">CSV</option>
            <option value="XLSX">XLSX</option>
          </select>
        </Field>
        {form.fileFormat === 'XLSX' ? (
          <Field label="Aba" hint="Vazio = primeira aba">
            <input value={form.sheetName} onChange={update('sheetName')} maxLength={31} />
          </Field>
        ) : (
          <Field label="Separador" hint="Vazio = detecção automática">
            <select value={form.csvDelimiter} onChange={update('csvDelimiter')}>
              <option value="">Automático</option>
              <option value=";">Ponto e vírgula (;)</option>
              <option value=",">Vírgula (,)</option>
              <option value={'\t'}>Tabulação</option>
              <option value="|">Barra vertical (|)</option>
            </select>
          </Field>
        )}
        <Field label="Colunas obrigatórias" hint="Uma por linha ou separadas por vírgula">
          <textarea rows={3} value={form.columns} onChange={update('columns')} />
        </Field>
        <Field label="Descrição">
          <textarea rows={2} value={form.description} onChange={update('description')} maxLength={2000} />
        </Field>
        <div>
          <Button type="submit" disabled={action.pending}>
            {action.pending ? 'Salvando…' : 'Cadastrar fonte'}
          </Button>
        </div>
      </form>
      <ErrorAlert error={action.error} />
    </Section>
  );
}
