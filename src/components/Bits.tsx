import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { useRefs } from '../lib/refs';
import { EXPENSE_APP_URL } from '../api';
import { relativeDay, shortDate, todayKL } from '../lib/dates';
import type { Payment, SpaceFilter } from '../types';

export function SpaceSwitch() {
  const { space, setSpace } = useRefs();
  const opts: { v: SpaceFilter; label: string }[] = [
    { v: 'all', label: 'All' },
    { v: 'work', label: 'Work' },
    { v: 'personal', label: 'Personal' },
  ];
  return (
    <div className="segmented space-switch" role="radiogroup" aria-label="Show">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={space === o.v} className={space === o.v ? 'on' : ''} onClick={() => setSpace(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SectionProps {
  title: ReactNode;
  count?: number;
  tone?: 'danger';
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Children are cards or a grid, not rows: no white box around them. */
  plain?: boolean;
}

export function Section({ title, count, tone, action, collapsible, defaultOpen = true, children, footer, plain }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <span className={`section-title ${tone === 'danger' ? 'is-danger' : ''}`}>
        {title}
        {count !== undefined ? <span className="section-count"> · {count}</span> : null}
      </span>
      {collapsible ? (
        <span className={`section-chevron ${open ? 'is-open' : ''}`}>
          <Icon name="chevron-down" size={16} />
        </span>
      ) : null}
    </>
  );
  return (
    <section className="section">
      <div className="section-head">
        {collapsible ? (
          <button className="section-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {head}
          </button>
        ) : (
          <h2 className="section-toggle">{head}</h2>
        )}
        {action}
      </div>
      {open ? <div className={plain ? 'section-plain' : 'group-body'}>{children}</div> : null}
      {open && footer ? <div className="group-footer">{footer}</div> : null}
    </section>
  );
}

export function PaymentRow({ p, showDate = true }: { p: Payment; showDate?: boolean }) {
  const today = todayKL();
  return (
    <a className="item-row payment-row" href={`${EXPENSE_APP_URL}subscriptions/${p.id}`} target="_blank" rel="noreferrer">
      <span className="row-glyph" aria-hidden="true">
        <Icon name="wallet" size={18} />
      </span>
      <span className="item-main">
        <span className="item-title">{p.name}</span>
        <span className="item-meta">
          {p.in_trial ? 'Trial ends' : p.kind === 'renewal' ? 'Renews' : 'Payment'}
          {showDate ? ` · ${relativeDay(p.next_due, today)}` : ''}
          {p.paid ? ' · paid' : ''}
        </span>
      </span>
      <span className="item-side">
        {p.amount !== null ? <span className="amount">RM{Number(p.amount).toFixed(2)}</span> : null}
      </span>
    </a>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="empty-line">{children}</div>;
}

export function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return <div className="offline-banner">Offline. Showing your last saved copy; changes will sync.</div>;
}

export function DateChip({ date }: { date: string }) {
  return <span className="date-chip">{shortDate(date)}</span>;
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="nav-button">
      <Icon name="chevron-left" size={22} />
      {label}
    </Link>
  );
}
