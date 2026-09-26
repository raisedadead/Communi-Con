import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Role } from '../shared/protocol';
import { ballotOpen, type Phase, phaseOf, type Session } from '../shared/session';
import { announce } from './announce';
import { useFeedback } from './components/Feedback';
import { Header, Presence, productName } from './components/Header';
import { clearFx } from './fx';
import { useRoom } from './room/useRoom';
import { links, readAdminKey, readRoute, storeAdminKey } from './route';
import { Admin } from './screens/Admin';
import { Audience } from './screens/Audience';
import { Landing } from './screens/Landing';
import { NoAccess, Setup } from './screens/Setup';
import { Stage } from './screens/Stage';

const event = 'IndiaFOSS 2026';

const phaseAnnouncements: Readonly<Record<Phase, string>> = {
  lobby: 'The talk ended.',
  listening: 'The talk started.',
  voting: 'Voting is open.',
  closed: 'Voting is closed.',
  applause: 'Round of applause. Clap for the speaker.',
  ended: 'Time is up. Voting is closed.',
};

function usePhaseEffects(role: Role, session: Session | undefined): void {
  const last = useRef<Phase | undefined>(undefined);
  const phase = session && phaseOf(session);
  const open = session !== undefined && ballotOpen(session);
  useEffect(() => {
    if (!phase) return;
    const previous = last.current;
    last.current = phase;
    if (!previous || previous === phase) return;
    if (!open) clearFx();
    if (role !== 'audience') return;
    announce(phaseAnnouncements[phase]);
    if (phase === 'voting') navigator.vibrate?.(200);
    if (phase === 'applause') navigator.vibrate?.([120, 60, 120, 60, 240]);
  }, [role, phase, open]);
}

function Message({
  header,
  title,
  text,
  children,
}: {
  header: ReactNode;
  title: string;
  text?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <>
      {header}
      <main className="screen">
        <section className="card">
          <h1>{title}</h1>
          {text && <p>{text}</p>}
          {children}
        </section>
      </main>
    </>
  );
}

function RoomScreen({
  role,
  room,
  adminKey,
  onRetry,
}: {
  role: Role;
  room: string;
  adminKey: string;
  onRetry: () => void;
}): ReactNode {
  const { flash } = useFeedback();
  const state = useRoom(room, role, adminKey, flash);
  const { session, snapshot } = state;
  usePhaseEffects(role, session);
  const roomLinks = links(room, adminKey);
  const status = session && (
    <Presence
      connected={state.connected}
      count={snapshot?.participants ?? 0}
      label={role === 'audience' ? ' here' : ' connected'}
    />
  );
  const header =
    role === 'admin' ? (
      <Header tag="Co-chair" status={status} />
    ) : (
      <Header event={event} stage={role === 'stage'} status={status} />
    );

  if (state.fatal) {
    const recovery = !state.final ? (
      <button className="button primary" data-key="retry" onClick={onRetry}>
        Try again
      </button>
    ) : role === 'audience' ? (
      <a className="button primary" href="/">
        Enter the code
      </a>
    ) : null;
    return (
      <Message header={header} title="Unable to join" text={state.fatal}>
        {recovery}
      </Message>
    );
  }
  if (!session || !snapshot) return <Message header={header} title="Connecting…" />;
  if (role === 'admin')
    return (
      <Admin room={state} session={session} snapshot={snapshot} links={roomLinks} header={header} />
    );
  if (role === 'stage')
    return (
      <Stage
        room={room}
        audienceLink={roomLinks.audience}
        session={session}
        snapshot={snapshot}
        header={header}
      />
    );
  return <Audience room={state} session={session} snapshot={snapshot} header={header} />;
}

export function App(): ReactNode {
  const [route, setRoute] = useState(readRoute);
  const [adminKey, setAdminKey] = useState(() =>
    route.role === 'admin' ? readAdminKey(route.room) : '',
  );
  const [attempt, setAttempt] = useState(0);
  const { role, room } = route;

  useEffect(() => {
    const title = `${productName} @ ${event}`;
    document.body.dataset.role = role;
    document.title = { audience: title, stage: `Stage · ${title}`, admin: `Co-chair · ${title}` }[
      role
    ];
  }, [role]);

  if (role === 'admin' && !adminKey) {
    if (room) return <NoAccess />;
    return (
      <Setup
        onCreated={created => {
          storeAdminKey(created.room, created.key);
          history.replaceState(null, '', `/admin?room=${created.room}`);
          setRoute({ role, room: created.room });
          setAdminKey(created.key);
        }}
      />
    );
  }
  if (!room) return <Landing event={event} />;
  return (
    <RoomScreen
      key={attempt}
      role={role}
      room={room}
      adminKey={adminKey}
      onRetry={() => setAttempt(value => value + 1)}
    />
  );
}
