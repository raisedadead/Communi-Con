import { type ReactNode, useState } from 'react';
import { Icon } from './Icon';

export const productName = 'Communi-Con';

interface HeaderProps {
  tag?: string;
  event?: string;
  stage?: boolean;
  status?: ReactNode;
}

function Logo(): ReactNode {
  return (
    <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#d3f86a" />
      <path d="M17 12v38l11-12 9 15 8-5-9-14 17-3z" fill="#202821" />
    </svg>
  );
}

export function Header({ tag, event, stage, status }: HeaderProps): ReactNode {
  return (
    <header className={stage ? 'bar stage-bar' : 'bar'}>
      <span className="brand">
        <Logo />
        {tag ? (
          <span className="chip">{tag}</span>
        ) : (
          <span className="brand-name">
            {productName} {event && <span className="brand-event">@ {event}</span>}
          </span>
        )}
      </span>
      {status}
    </header>
  );
}

export function People({ count, label }: { count: number; label: string }): ReactNode {
  const [initial] = useState(count);
  const [changed, setChanged] = useState(false);
  if (!changed && count !== initial) setChanged(true);
  return (
    <span className="people">
      <Icon name="people" />
      <span className={changed ? 'badge pop' : 'badge enter'} key={count}>
        {count}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Presence({
  connected,
  count,
  label,
}: {
  connected: boolean;
  count: number;
  label: string;
}): ReactNode {
  return connected ? (
    <People count={count} label={label} />
  ) : (
    <span className="net off">Connecting…</span>
  );
}
