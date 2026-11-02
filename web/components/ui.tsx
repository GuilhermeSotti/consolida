'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ApiError } from '@/lib/api';
import { STATUS_LABELS } from '@/lib/format';
import type { PageMetadata } from '@/lib/types';

export function Button({ variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button type="button" {...props} className={`button button-${variant} ${props.className ?? ''}`} />;
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p className="muted" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function ErrorAlert({ error, title, message }: { error?: ApiError; title?: string; message?: string }) {
  if (!error && !message) return null;
  return (
    <div className="alert" role="alert">
      <strong>{title ?? 'Não foi possível concluir a operação'}</strong>
      <p>{message ?? error?.message}</p>
      {error?.details && error.details.length > 0 && (
        <ul>
          {error.details.map((detail, index) => (
            <li key={`${detail.field ?? 'detalhe'}-${index}`}>
              {detail.field ? <code>{detail.field}</code> : null} {detail.message}
            </li>
          ))}
        </ul>
      )}
      {error?.requestId && <p className="muted">Protocolo: {error.requestId}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-header">
        <h2>{title}</h2>
        {actions && <div className="card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Pagination({ metadata, onPage }: { metadata?: PageMetadata; onPage: (page: number) => void }) {
  if (!metadata || metadata.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Paginação">
      <Button variant="secondary" disabled={metadata.page <= 1} onClick={() => onPage(metadata.page - 1)}>
        Anterior
      </Button>
      <span>
        Página {metadata.page} de {metadata.totalPages} ({metadata.totalItems} itens)
      </span>
      <Button variant="secondary" disabled={metadata.page >= metadata.totalPages} onClick={() => onPage(metadata.page + 1)}>
        Próxima
      </Button>
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}
