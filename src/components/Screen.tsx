import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ScreenProps {
  title: string;
  sub?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  /** Hide the big title (form screens show a small title in the bar). */
  compact?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * iOS-style screen: transparent bar with a large title that turns into a frosted bar with a
 * small centred title once you scroll. On a laptop it sits to the right of the sidebar.
 */
export function Screen({ title, sub, left, right, compact, className, children }: ScreenProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setSolid(!entry.isIntersecting), {
      rootMargin: '-48px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.title = title === 'Today' ? 'Planner' : `${title} · Planner`;
  }, [title]);

  return (
    <div className={`screen ${className ?? ''}`}>
      <header className={`navbar ${solid || compact ? 'is-solid' : ''}`}>
        <div className="navbar-row">
          <div className="navbar-side">{left}</div>
          <div className={`navbar-title ${solid || compact ? '' : 'is-hidden'}`}>{title}</div>
          <div className="navbar-side navbar-side-end">{right}</div>
        </div>
      </header>
      {!compact && (
        <div className="large-title">
          {sub ? <div className="large-title-eyebrow">{sub}</div> : null}
          <h1>{title}</h1>
        </div>
      )}
      <div ref={sentinel} className="scroll-sentinel" />
      {children}
    </div>
  );
}
