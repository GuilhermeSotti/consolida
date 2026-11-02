'use client';

import Link from 'next/link';
import { useSession } from '@/components/providers';
import { Empty, ErrorAlert, Loading, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useResource } from '@/lib/hooks';
import type { Execution, Notification } from '@/lib/types';

export default function HomePage() {
  const { principal, can } = useSession();
  const executions = useResource(
    () => (can('executions:view') ? api.page<Execution>('/executions', { pageSize: 5 }) : Promise.resolve(undefined)),
    'home-executions',
  );
  const notifications = useResource(() => api.page<Notification>('/notifications', { unreadOnly: true, pageSize: 5 }), 'home-notifications');

  return (
    <>
      <h1>Olá, {principal.displayName}</h1>
      <p className="muted">Papéis: {principal.roles.length ? principal.roles.join(', ') : 'nenhum'}</p>
      {can('executions:view') && (
        <Section title="Execuções recentes" actions={<Link href="/executions">Ver todas</Link>}>
          {executions.loading && <Loading />}
          <ErrorAlert error={executions.error} />
          {executions.data && executions.data.items.length === 0 && <Empty>Nenhuma execução registrada.</Empty>}
          {executions.data && executions.data.items.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th scope="col">Execução</th>
                  <th scope="col">Status</th>
                  <th scope="col">Linhas (entrada → saída)</th>
                  <th scope="col">Solicitada em</th>
                </tr>
              </thead>
              <tbody>
                {executions.data.items.map((execution) => (
                  <tr key={execution.id}>
                    <td>
                      <Link href={`/executions/${execution.id}`}>{execution.id.slice(0, 8)}</Link>
                    </td>
                    <td>
                      <StatusBadge status={execution.status} />
                    </td>
                    <td>
                      {formatNumber(execution.rowsIn)} → {formatNumber(execution.rowsOut)}
                    </td>
                    <td>{formatDateTime(execution.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}
      <Section title="Notificações não lidas" actions={<Link href="/notifications">Ver todas</Link>}>
        {notifications.loading && <Loading />}
        <ErrorAlert error={notifications.error} />
        {notifications.data && notifications.data.items.length === 0 && <Empty>Nada novo.</Empty>}
        <ul className="list">
          {notifications.data?.items.map((notification) => (
            <li key={notification.id}>
              <strong>{notification.title}</strong> — {notification.message} <span className="muted">({formatDateTime(notification.createdAt)})</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
