import type { CSSProperties, ReactNode } from 'react';
import { type Session, timeLabel, votingWindow } from '../../shared/session';

export function Clock({ session }: { session: Session }): ReactNode {
  const { from, to } = votingWindow(session);
  const marks = [from, to].filter(seconds => seconds > 0 && seconds < session.length);
  return (
    <>
      <div className="clock">
        <span className="time" role="timer">
          {timeLabel(session.elapsed)}
        </span>
        <span className="of">of {timeLabel(session.length)}</span>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{ width: `${(session.elapsed / session.length) * 100}%` }} />
        {marks.map(seconds => (
          <span
            className="mark"
            key={seconds}
            style={{ '--at': `${((seconds / session.length) * 100).toFixed(2)}%` } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}

export function closesIn(session: Session): string {
  return `Closes in ${timeLabel(Math.max(0, votingWindow(session).to - session.elapsed))}`;
}
