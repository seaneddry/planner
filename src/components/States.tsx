import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Loading() {
  return (
    <div className="empty" role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <div>{message}</div>
      {onRetry ? (
        <button className="button button-secondary button-small" style={{ marginTop: 10 }} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
