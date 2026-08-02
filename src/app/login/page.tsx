'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, setAuthToken } from '../lib/api';

type LoginResponse = {
  message?: string;
  entraLoginUrl?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await apiPost<LoginResponse>('/auth/validate-token', { token });
      if (response && (response as { email?: string }).email) {
        setAuthToken(token);
        router.replace('/dashboard');
        return;
      }

      setMessage('Token inválido. Use um token JWT válido.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao validar token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1>Entrar no ConsolidaHub</h1>
      <p className="muted">A autenticação usa o fluxo do backend com Entra ID. Para a demonstração, informe um token JWT válido.</p>
      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          E-mail
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" />
        </label>
        <label>
          Token JWT
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder="token" />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Validando...' : 'Entrar'}</button>
      </form>
      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
    </div>
  );
}
