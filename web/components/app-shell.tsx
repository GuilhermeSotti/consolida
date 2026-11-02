'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useSession } from './providers';
import { Button } from './ui';

const NAVIGATION: Array<{ href: string; label: string; permission?: string }> = [
  { href: '/', label: 'Início' },
  { href: '/sources', label: 'Fontes e cargas', permission: 'sources:view' },
  { href: '/rules', label: 'Regras', permission: 'rules:view' },
  { href: '/executions', label: 'Execuções', permission: 'executions:view' },
  { href: '/reports', label: 'Relatórios', permission: 'reports:view' },
  { href: '/notifications', label: 'Notificações' },
  { href: '/admin/users', label: 'Usuários', permission: 'users:view' },
  { href: '/admin/audit', label: 'Auditoria', permission: 'audit:view' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { principal, can, logout } = useSession();
  const pathname = usePathname();
  const [unread, setUnread] = useState<number>();

  useEffect(() => {
    let active = true;
    const refresh = () =>
      api
        .page('/notifications', { unreadOnly: true, pageSize: 1 })
        .then((page) => active && setUnread(page.metadata.totalItems))
        .catch(() => undefined);
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="shell">
      <a href="#conteudo" className="skip-link">
        Ir para o conteúdo
      </a>
      <header className="topbar">
        <strong className="brand">ConsolidaHub</strong>
        <nav aria-label="Principal">
          <ul>
            {NAVIGATION.filter((item) => !item.permission || can(item.permission)).map((item) => {
              const current = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={current ? 'page' : undefined}>
                    {item.label}
                    {item.href === '/notifications' && unread ? <span className="counter" aria-label={`${unread} não lidas`}>{unread}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="user">
          <span title={principal.roles.join(', ') || 'sem papéis'}>{principal.displayName}</span>
          <Button variant="secondary" onClick={logout}>
            Sair
          </Button>
        </div>
      </header>
      <main id="conteudo" className="content">
        {principal.roles.length === 0 && (
          <div className="alert info" role="status">
            <strong>Acesso pendente</strong>
            <p>Seu usuário foi registrado, mas ainda não possui papéis. Solicite acesso a um administrador do ConsolidaHub.</p>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
