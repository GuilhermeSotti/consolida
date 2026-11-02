'use client';

import { useState } from 'react';
import { Empty, ErrorAlert, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useResource } from '@/lib/hooks';
import type { AuditEvent } from '@/lib/types';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const events = useResource(
    () => api.page<AuditEvent>('/audit-events', { page, pageSize: 50, action: action.trim().toUpperCase(), entityType: entityType.trim() }),
    `audit-${page}-${action}-${entityType}`,
  );
  return (
    <>
      <h1>Trilha de auditoria</h1>
      <Section
        title="Eventos"
        actions={
          <>
            <input aria-label="Ação" placeholder="Ação (ex.: RULE_UPDATED)" value={action} onChange={(event) => setAction(event.target.value)} />
            <input aria-label="Entidade" placeholder="Entidade (ex.: Rule)" value={entityType} onChange={(event) => setEntityType(event.target.value)} />
          </>
        }
      >
        {events.loading && <Loading />}
        <ErrorAlert error={events.error} />
        {events.data?.items.length === 0 && <Empty>Nenhum evento.</Empty>}
        {events.data && events.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Ação</th>
                  <th scope="col">Entidade</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Ator</th>
                  <th scope="col">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.occurredAt)}</td>
                    <td>
                      <code>{event.action}</code>
                    </td>
                    <td>
                      {event.entityType} {event.entityId ? <code>{event.entityId.slice(0, 8)}</code> : null}
                    </td>
                    <td>
                      <StatusBadge status={event.outcome} />
                    </td>
                    <td>{event.actorUserId ? <code>{event.actorUserId.slice(0, 8)}</code> : 'sistema'}</td>
                    <td>
                      <code className="small">{event.details ? JSON.stringify(event.details) : ''}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination metadata={events.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
