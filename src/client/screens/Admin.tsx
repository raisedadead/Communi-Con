import { type FormEvent, type ReactNode, useState } from 'react';
import type { Results, RoomSnapshot } from '../../shared/protocol';
import {
  type Action,
  canNudge,
  type Opinion,
  phaseOf,
  type Session,
  type Timing,
  timeLabel,
  timingProblem,
} from '../../shared/session';
import { announce } from '../announce';
import { Clock, closesIn } from '../components/Clock';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { type DraftField, useDraft } from '../components/useDraft';
import type { Basis, Room } from '../room/useRoom';

type LinkKind = 'audience' | 'stage' | 'admin';

interface AdminProps {
  room: Room;
  session: Session;
  snapshot: RoomSnapshot;
  links: Record<LinkKind, string>;
  header: ReactNode;
}

const timingHelp: Readonly<Record<keyof Timing, string>> = {
  length: 'Talk length must be 1 to 120 min.',
  opensAt: 'Voting must open between 0 min and the talk length.',
  lasts: 'Voting must last 0.25 to 120 min.',
};

const stateLabels = {
  lobby: 'Between talks',
  listening: 'Listening',
  voting: 'Voting open',
  closed: 'Voting closed',
  applause: 'Applause on screen',
  ended: 'Time is up',
} as const;

function minutes(seconds: number): string {
  return `${Math.round((seconds / 60) * 100) / 100}`;
}

function basisOf(snapshot: RoomSnapshot): Basis {
  return { roundId: snapshot.roundId, version: snapshot.version };
}

function useControls(room: Room): {
  busy: boolean;
  run: (action: Action) => boolean;
} {
  const basis = room.snapshot ? basisOf(room.snapshot) : undefined;
  return {
    busy: room.pending || !room.connected,
    run: action => room.act(action, basis),
  };
}

function SpeakerForm({
  room,
  label,
  field,
}: {
  room: Room;
  label: string;
  field: DraftField;
}): ReactNode {
  const busy = room.pending || !room.connected;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    room.act({ type: 'speaker', name: field.value });
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <label htmlFor="speaker-name">{label}</label>
      <input
        className="input"
        id="speaker-name"
        name="speaker"
        maxLength={60}
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
        data-key="speaker"
        {...field}
      />
      <button className="button small" data-key="save-speaker" disabled={busy}>
        Save name
      </button>
    </form>
  );
}

function TimingField({
  name,
  label,
  saved,
  invalid,
}: {
  name: keyof Timing;
  label: string;
  saved: number;
  invalid: boolean;
}): ReactNode {
  const field = useDraft(minutes(saved));
  return (
    <label className="timing-row">
      <span>{label}</span>
      <input
        className="input"
        name={name}
        inputMode="decimal"
        autoComplete="off"
        data-key={name}
        {...field}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? 'timing-error' : undefined}
      />
      <span className="quiet">min</span>
    </label>
  );
}

function TimingCard({ room, session }: { room: Room; session: Session }): ReactNode {
  const { confirm } = useFeedback();
  const { busy, run } = useControls(room);
  const [problem, setProblem] = useState<keyof Timing | null>(null);
  const saved: Timing = { length: session.planned, opensAt: session.opensAt, lasts: session.lasts };

  const savedKey = `${saved.length}/${saved.opensAt}/${saved.lasts}`;
  const [checked, setChecked] = useState(savedKey);
  if (savedKey !== checked) {
    setChecked(savedKey);
    setProblem(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const seconds = (key: keyof Timing): number => {
      const value = String(form.get(key)).trim().replace(',', '.');
      return value ? Math.round(Number(value) * 60) : Number.NaN;
    };
    const timing = {
      length: seconds('length'),
      opensAt: seconds('opensAt'),
      lasts: seconds('lasts'),
    };
    const found = timingProblem(timing);
    setProblem(found);
    if (found) {
      announce(timingHelp[found]);
      return;
    }
    const endsTalk =
      session.mode === 'talk' &&
      !session.applause &&
      timing.length !== session.planned &&
      timing.length <= session.elapsed;
    if (
      endsTalk &&
      !(await confirm(
        'The new length has already passed. Saving ends the talk now.',
        'Save and end talk',
      ))
    )
      return;
    run({ type: 'timing', ...timing });
  }

  return (
    <section className="card" aria-labelledby="timing-title">
      <h2 id="timing-title">Timing</h2>
      <form className="form" onSubmit={submit}>
        <TimingField
          name="length"
          label="Talk length"
          saved={saved.length}
          invalid={problem === 'length'}
        />
        <TimingField
          name="opensAt"
          label="Voting opens at"
          saved={saved.opensAt}
          invalid={problem === 'opensAt'}
        />
        <TimingField
          name="lasts"
          label="Voting lasts"
          saved={saved.lasts}
          invalid={problem === 'lasts'}
        />
        {problem && (
          <p className="field-error" id="timing-error">
            {timingHelp[problem]}
          </p>
        )}
        <button className="button small" data-key="save-timing" disabled={busy}>
          Save timing
        </button>
      </form>
      <p className="quiet">Applies now and to the next talks.</p>
    </section>
  );
}

async function share(url: string, flash: (text: string) => void): Promise<void> {
  try {
    if (navigator.share) await navigator.share({ url });
    else {
      await navigator.clipboard.writeText(url);
      flash('Link copied.');
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      prompt('Copy this link:', url);
  }
}

function ShareCard({ links }: { links: Record<LinkKind, string> }): ReactNode {
  const { flash } = useFeedback();
  const stagePath = links.stage.slice(location.origin.length);
  const button = (kind: LinkKind, label: string): ReactNode => (
    <button
      className="button"
      data-key={`share-${kind}`}
      onClick={() => void share(links[kind], flash)}
    >
      {label}
    </button>
  );
  return (
    <section className="card" aria-labelledby="share-title">
      <h2 id="share-title">Share</h2>
      <a className="button" href={links.stage} target="_blank" rel="noopener">
        Open stage screen
        <Icon name="external" />
      </a>
      {button('stage', 'Share stage link')}
      <p className="quiet">
        Or type this address on the projector:{' '}
        <strong className="address">
          {location.host}
          <wbr />
          {stagePath}
        </strong>
      </p>
      {button('audience', 'Share audience link')}
      {button('admin', 'Share co-chair link')}
      <p className="quiet">Anyone with the co-chair link can run the talk and see the totals.</p>
    </section>
  );
}

function Result({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}): ReactNode {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="result">
      <div className="result-head">
        <span>{label}</span>
        <strong>
          {count} · {percent}%
        </strong>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function VotesCard({
  results,
  participants,
}: {
  results: Results;
  participants: number;
}): ReactNode {
  const labels: Record<Opinion, string> = { keep: 'Keep going', wrap: 'Wrap it up' };
  return (
    <section className="card" aria-labelledby="votes-title">
      <h2 id="votes-title">Votes</h2>
      {(['keep', 'wrap'] as const).map(opinion => (
        <Result
          key={opinion}
          label={labels[opinion]}
          count={results[opinion]}
          total={results.total}
        />
      ))}
      <p className="quiet">
        {results.total} {results.total === 1 ? 'vote' : 'votes'}. {participants}{' '}
        {participants === 1 ? 'phone' : 'phones'} connected.
      </p>
      <p className="quiet">Only the co-chairs see these totals.</p>
    </section>
  );
}

function ActionButton({
  label,
  primary,
  disabled,
  dataKey,
  onClick,
}: {
  label: string;
  primary?: boolean;
  disabled: boolean;
  dataKey: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      className={primary ? 'button primary' : 'button'}
      data-key={dataKey}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Controls({ room, session }: { room: Room; session: Session }): ReactNode {
  const { confirm } = useFeedback();
  const { busy, run } = useControls(room);
  const phase = phaseOf(session);
  const running = session.mode === 'talk' && phase !== 'applause' && phase !== 'ended';

  async function endTalk(): Promise<void> {
    if (
      phase !== 'applause' &&
      phase !== 'ended' &&
      !(await confirm('End this talk? This clears the votes and the speaker name.', 'End talk'))
    )
      return;
    run({ type: 'reset' });
  }

  async function cue(): Promise<void> {
    if (
      phase === 'listening' &&
      !(await confirm('Cue applause now? Voting has not opened.', 'Cue applause'))
    )
      return;
    run({ type: 'applause' });
  }

  if (phase === 'applause')
    return (
      <>
        <ActionButton
          label="Next talk"
          primary
          disabled={busy}
          dataKey="reset"
          onClick={() => void endTalk()}
        />
        <p className="quiet">This clears the votes and the speaker name.</p>
      </>
    );

  const reopen = phase === 'listening' || phase === 'closed';
  return (
    <>
      {reopen && (
        <>
          <ActionButton
            label={phase === 'closed' ? 'Open voting again' : 'Open voting now'}
            disabled={busy}
            dataKey="open"
            onClick={() => run({ type: 'open' })}
          />
          <p className="quiet">
            Voting stays open for{' '}
            {minutes(Math.min(session.lasts, session.length - Math.floor(session.elapsed)))} min.
          </p>
        </>
      )}
      {phase === 'voting' && <p className="closes-line">{closesIn(session)}</p>}
      <ActionButton
        label="Cue applause"
        primary={phase !== 'listening'}
        disabled={busy}
        dataKey="applause"
        onClick={() => void cue()}
      />
      <p className="quiet">Shows on every screen.</p>
      <div className="row">
        {running && (
          <ActionButton
            label={session.paused ? 'Resume' : 'Pause'}
            disabled={busy}
            dataKey="pause"
            onClick={() => run({ type: 'pause' })}
          />
        )}
        <ActionButton
          label={running ? 'End talk' : 'Next talk'}
          disabled={busy}
          dataKey="reset"
          onClick={() => void endTalk()}
        />
      </div>
    </>
  );
}

function Adjust({ room, session }: { room: Room; session: Session }): ReactNode {
  const busy = room.pending || !room.connected;
  const nudge = (seconds: number, label: string): ReactNode => (
    <button
      className="button small"
      data-key={`nudge${seconds}`}
      disabled={busy || !canNudge(session, seconds)}
      onClick={() => room.act({ type: 'nudge', seconds })}
    >
      {label}
    </button>
  );
  return (
    <fieldset className="adjust" aria-labelledby="adjust-title">
      <span className="quiet" id="adjust-title">
        Length of this talk
      </span>
      {nudge(-60, '−1 min')}
      {nudge(60, '+1 min')}
    </fieldset>
  );
}

export function Admin({ room, session, snapshot, links, header }: AdminProps): ReactNode {
  const { busy, run } = useControls(room);
  const speaker = useDraft(snapshot.speaker);
  const phase = phaseOf(session);
  const name = snapshot.speaker;
  const label = session.paused ? 'Paused' : stateLabels[phase];
  const mood = session.paused ? 'paused' : phase === 'lobby' ? 'idle' : 'live';
  const title = (
    <h1 className="state" data-mood={mood}>
      <span className="pulse" aria-hidden="true" />
      {label}
    </h1>
  );

  if (phase === 'lobby') {
    const lasts = Math.min(session.lasts, session.length - session.opensAt);
    return (
      <>
        {header}
        <main className="screen">
          <section className="card">
            {title}
            <SpeakerForm room={room} label="Next speaker" field={speaker} />
            <ActionButton
              label="Start talk"
              primary
              disabled={busy}
              dataKey="start"
              onClick={() => run({ type: 'start', speaker: speaker.value })}
            />
            <p className="quiet">
              Voting opens at {timeLabel(session.opensAt)} for {minutes(lasts)} min.
            </p>
          </section>
          <TimingCard room={room} session={session} />
          <ShareCard links={links} />
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="screen">
        <section className="card">
          {name && (
            <p className="on-air-line">
              <span className="live">On air</span>
              {name}
            </p>
          )}
          {title}
          <Clock session={session} />
          {phase !== 'applause' && <Adjust room={room} session={session} />}
          <Controls room={room} session={session} />
        </section>
        {snapshot.results && (
          <VotesCard results={snapshot.results} participants={snapshot.participants} />
        )}
        <section className="card" aria-labelledby="speaker-title">
          <h2 id="speaker-title">Speaker</h2>
          <SpeakerForm room={room} label="Name" field={speaker} />
        </section>
        <TimingCard room={room} session={session} />
        <ShareCard links={links} />
      </main>
    </>
  );
}
