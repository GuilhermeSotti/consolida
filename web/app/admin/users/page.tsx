'use client';

import { useState } from 'react';
import { useSession } from '@/components/providers';
import { Button, Empty, ErrorAlert, Loading, Pagination, Section, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAction, useResource } from '@/lib/hooks';
import type { Role, User } from '@/lib/types';

export default function UsersPage() {
  const { can, principal } = useSession();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const users = useResource(() => api.page<User>('/users', { page, pageSize: 20, search }), `users-${page}-${search}`);
  const roles = useResource(() => api.get<Role[]>('/roles'), 'roles');
  const action = useAction();
  const manage = can('users:manage');

  async function toggleRole(user: User, role: string) {
    const next = user.roles.includes(role) ? user.roles.filter((code) => code !== role) : [...user.roles, role];
    if (await action.run(() => api.put<User>(`/users/${user.id}/roles`, { roles: next }))) users.reload();
  }

  async function toggleStatus(user: User) {
    if (await action.run(() => api.patch<User>(`/users/${user.id}/status`, { status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }))) users.reload();
  }

  return (
    <>
      <h1>Usuários e papéis</h1>
      <p className="muted">
        Usuários são criados no primeiro acesso via Entra ID, sem papéis. Somente administradores concedem ou removem o papel ADMIN.
      </p>
      <ErrorAlert error={action.error} />
      <Section
        title="Usuários"
        actions={
          <input
            type="search"
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar usuários"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        }
      >
        {(users.loading || roles.loading) && <Loading />}
        <ErrorAlert error={users.error ?? roles.error} />
        {users.data?.items.length === 0 && <Empty>Nenhum usuário encontrado.</Empty>}
        {users.data && roles.data && users.data.items.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Status</th>
                  {roles.data.map((role) => (
                    <th key={role.code} scope="col" title={role.description ?? undefined}>
                      {role.name}
                    </th>
                  ))}
                  <th scope="col">Último acesso</th>
                  {manage && <th scope="col">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {user.displayName}
                      <br />
                      <span className="muted">{user.email ?? ''}</span>
                    </td>
                    <td>
                      <StatusBadge status={user.status} />
                    </td>
                    {roles.data!.map((role) => (
                      <td key={role.code}>
                        <input
                          type="checkbox"
                          aria-label={`${role.name} para ${user.displayName}`}
                          checked={user.roles.includes(role.code)}
                          disabled={!manage || action.pending}
                          onChange={() => void toggleRole(user, role.code)}
                        />
                      </td>
                    ))}
                    <td>{formatDateTime(user.lastSeenAt)}</td>
                    {manage && (
                      <td>
                        <Button variant="secondary" disabled={action.pending || user.id === principal.userId} onClick={() => void toggleStatus(user)}>
                          {user.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination metadata={users.data?.metadata} onPage={setPage} />
      </Section>
    </>
  );
}
