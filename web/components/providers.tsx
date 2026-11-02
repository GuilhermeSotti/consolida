'use client';

import { InteractionStatus, type PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider, useIsAuthenticated, useMsal } from '@azure/msal-react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { initializeMsal, loginRequest } from '@/lib/msal';
import type { Principal } from '@/lib/types';
import { AppShell } from './app-shell';
import { Button, ErrorAlert, Loading } from './ui';

interface Session {
  principal: Principal;
  can: (...permissions: string[]) => boolean;
  logout: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession fora do contexto autenticado.');
  return session;
}

/** Initializes MSAL in the browser before rendering anything that may need a token. */
export function Providers({ children }: { children: ReactNode }) {
  const [msal, setMsal] = useState<PublicClientApplication>();
  const [failure, setFailure] = useState<string>();
  useEffect(() => {
    initializeMsal()
      .then(setMsal)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : 'Falha ao iniciar a autenticação.'));
  }, []);
  if (failure) return <main className="center"><ErrorAlert title="Configuração de autenticação inválida" message={failure} /></main>;
  if (!msal) return <main className="center"><Loading label="Iniciando…" /></main>;
  return (
    <MsalProvider instance={msal}>
      <AuthGate>{children}</AuthGate>
    </MsalProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { instance, inProgress } = useMsal();
  const authenticated = useIsAuthenticated();
  if (inProgress !== InteractionStatus.None && !authenticated) return <main className="center"><Loading label="Autenticando…" /></main>;
  if (!authenticated) {
    return (
      <main className="center login">
        <h1>ConsolidaHub</h1>
        <p>Motor de Regras e Relatório Consolidado</p>
        <Button onClick={() => void instance.loginRedirect(loginRequest)}>Entrar com a conta corporativa</Button>
        <p className="muted">O acesso usa o Microsoft Entra ID da organização. Nenhuma senha é informada a este sistema.</p>
      </main>
    );
  }
  return <SessionLoader>{children}</SessionLoader>;
}

function SessionLoader({ children }: { children: ReactNode }) {
  const { instance } = useMsal();
  const me = useResource(() => api.get<Principal>('/auth/me'), 'me');
  const session = useMemo<Session | null>(() => {
    if (!me.data) return null;
    const permissions = new Set(me.data.permissions);
    return {
      principal: me.data,
      can: (...required) => required.every((permission) => permissions.has(permission)),
      logout: () => void instance.logoutRedirect({ account: instance.getActiveAccount() ?? undefined }),
    };
  }, [me.data, instance]);
  if (me.loading && !me.data) return <main className="center"><Loading label="Carregando perfil…" /></main>;
  if (me.error || !session) {
    return (
      <main className="center">
        <ErrorAlert error={me.error} title={me.error?.code === 'USER_INACTIVE' ? 'Usuário desativado' : 'Não foi possível carregar o perfil'} />
        <Button variant="secondary" onClick={() => void instance.logoutRedirect()}>Sair</Button>
      </main>
    );
  }
  return (
    <SessionContext.Provider value={session}>
      <AppShell>{children}</AppShell>
    </SessionContext.Provider>
  );
}
