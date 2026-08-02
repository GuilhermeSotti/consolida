'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuthToken } from '../lib/api';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/rules', label: 'Regras' },
  { href: '/sources', label: 'Fontes' },
  { href: '/executions', label: 'Execuções' },
  { href: '/reports', label: 'Relatórios' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearAuthToken();
    router.replace('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">ConsolidaHub</div>
        <nav className="nav-list" aria-label="Navegação principal">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ marginTop: 24 }}>
          <button type="button" onClick={handleLogout} className="secondary">
            Sair
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
