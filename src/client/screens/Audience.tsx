import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { ballotOpen, type Opinion, phaseOf, type Session, timeLabel } from '../../shared/session';
import { Applause } from '../components/Applause';
import { Clock, closesIn } from '../components/Clock';
import { Crowd } from '../components/Crowd';
import { Icon } from '../components/Icon';
import { burst } from '../fx';
import type { Room } from '../room/useRoom';

interface ScreenProps {
  room: Room;
  session: Session;
  snapshot: RoomSnapshot;
  header: ReactNode;
}

interface ChoiceProps {
  value: Opinion;
  emoji: string;
  label: string;
  opinion: Opinion | null;
  enabled: boolean;
  onVote: (value: Opinion, box: DOMRect) => void;
}

function Choice({ value, emoji, label, opinion, enabled, onVote }: ChoiceProps): ReactNode {
  const selected = opinion === value;
  return (
    <button
      className="choice"
      data-key={`vote-${value}`}
      aria-pressed={selected}
      disabled={!enabled}
      onClick={(event: MouseEvent<HTMLButtonElement>) =>
        onVote(value, event.currentTarget.getBoundingClientRect())
      }
    >
      <span className={selected ? 'emoji enter' : 'emoji'} aria-hidden="true" key={`${selected}`}>
        {emoji}
      </span>
      <span className="choice-label">{label}</span>
      {selected && (
        <span className="tick enter">
          <Icon name="check" />
        </span>
      )}
    </button>
  );
}

function OnAir({ name }: { name: string }): ReactNode {
  if (!name) return null;
  return (
    <div className="on-air">
      <span className="live">On air</span>
      <p className="speaker enter" key={name}>
        {name}
      </p>
    </div>
  );
}

function Lobby({
  name,
  others,
  header,
}: {
  name: string;
  others: number | null;
  header: ReactNode;
}): ReactNode {
  return (
    <>
      {header}
      <main className="screen">
        <section className="card crowd-card">
          <Crowd others={others} />
          <p className="quiet">Each dot is one person. Yours is lime.</p>
        </section>
        <section className="intro">
          {name ? (
            <>
              <p>
                <span className="live next enter">Up next</span>
              </p>
              <h1 className="display enter" key={name} style={{ '--i': 1 } as CSSProperties}>
                {name}
              </h1>
            </>
          ) : (
            <h1 className="display enter">You are in.</h1>
          )}
          <p>Keep this page open. Voting opens during each talk.</p>
          <p className="quiet">
            Votes are anonymous. Your first vote shows as 👍 or 👎 on the screens. Only the
            co-chairs see the totals.
          </p>
        </section>
      </main>
    </>
  );
}

function hint(
  session: Session,
  closed: boolean,
  opinion: Opinion | null,
  sending: boolean,
): string {
  if (closed) return opinion ? 'Thank you for voting.' : '';
  if (session.paused) return 'Voting continues when the talk resumes.';
  if (sending) return 'Sending…';
  if (opinion) return 'Vote received. You can change it until voting closes.';
  return 'Only the co-chairs see the totals.';
}

export function Audience({ room, session, snapshot, header }: ScreenProps): ReactNode {
  const phase = phaseOf(session);
  const name = snapshot.speaker;
  if (phase === 'applause')
    return (
      <Applause
        header={header}
        text={`Put your phone down and clap for ${name || 'the speaker'}.`}
      />
    );
  if (phase === 'lobby')
    return (
      <Lobby
        name={name}
        others={room.connected ? snapshot.participants - 1 : null}
        header={header}
      />
    );
  if (phase === 'ended')
    return (
      <>
        {header}
        <main className="screen">
          <section className="intro">
            <h1 className="display enter">Time is up.</h1>
            <p className="enter" style={{ '--i': 1 } as CSSProperties}>
              Voting is closed.
            </p>
          </section>
        </main>
      </>
    );

  const open = ballotOpen(session);
  const opinion = room.pendingVote || snapshot.opinion || null;
  const closed = phase === 'closed';
  const label = session.paused
    ? 'Paused'
    : open
      ? 'Voting open'
      : closed
        ? 'Voting closed'
        : 'Listening';
  const mood = session.paused ? 'paused' : open ? 'open' : 'live';
  const enabled = open && room.connected && !room.pending;
  const note = hint(session, closed, opinion, room.pendingVote !== null);

  function vote(value: Opinion, box: DOMRect): void {
    if (room.act({ type: 'vote', opinion: value })) burst(box);
  }

  return (
    <>
      {header}
      <main className="screen">
        <section className="card">
          <OnAir name={name} />
          <h1 className="state enter" data-mood={mood} key={label}>
            <span className="pulse" aria-hidden="true" />
            {label}
          </h1>
          <Clock session={session} />
        </section>
        <section className="card">
          {phase === 'listening' ? (
            <p>
              {session.openedAt === null
                ? `Voting opens at ${timeLabel(session.opensAt)}.`
                : 'Voting opens soon.'}
            </p>
          ) : (
            <>
              <div className="ballot-head">
                <h2>Your vote</h2>
                {open && <span className="closes">{closesIn(session)}</span>}
              </div>
              <div className="choices">
                <Choice
                  value="keep"
                  emoji="👍"
                  label="Keep going"
                  opinion={opinion}
                  enabled={enabled}
                  onVote={vote}
                />
                <Choice
                  value="wrap"
                  emoji="👎"
                  label="Wrap it up"
                  opinion={opinion}
                  enabled={enabled}
                  onVote={vote}
                />
              </div>
              {note && <p className="quiet">{note}</p>}
            </>
          )}
        </section>
      </main>
    </>
  );
}
