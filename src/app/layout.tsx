import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from './components/app-shell';

export const metadata: Metadata = {
  title: 'ConsolidaHub',
  description: 'Painel operacional do motor de consolidação',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
