'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Empty, ErrorAlert, Loading, Pagination, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { Notification } from '@/lib/types';

function linkTo(notification: Notification): string | null {
  if (!notification.entityId) return null;
  if (notification.entityType === 'Execution') return `/executions/${notification.entityId}`;
  if (notification.entityType === 'DataImport') return `/imports/${notification.entityId}`;
  return null;
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const notifications = useResource(() => api.page<Notification>('/notifications', { page, pageSize: 20 }), `notifications-${page}`);
  const action = useAction();

  async function markAll() {
    if (await action.run(() => api.post('/notifications/read-all'))) notifications.reload();
  }
  async function markRead(id: string) {
    if (await action.run(() => api.post(`/notifications/${id}/read`))) notifications.reload();
  }

  return (
    <>
      <h1>Notificações</h1>
      <Section title="Suas notificações" actions={<Button variant="secondary" onClick={() => void markAll()}>Marcar todas como lidas</Button>}>
        {notifications.loading && <Loading />}
        <ErrorAlert error={notifications.error ?? action.error} />
        {notifications.data?.items.length === 0 && <Empty>Nenhuma notificação.</Empty>}
        <ul className="list">
          {notifications.data?.items.map((notification) => {
            const href = linkTo(notification);
            return (
              <li key={notification.id} className={notification.readAt ? 'read' : 'unread'}>
                <strong>{notification.title}</strong> — {notification.message} <span className="muted">{formatDateTime(notification.createdAt)}</span>{' '}
                {href && <Link href={href}>abrir</Link>}{' '}
                {!notification.readAt && (
                  <Button variant="secondary" onClick={() => void markRead(notification.id)}>
                    Marcar como lida
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <Pagination metadata={notifications.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
