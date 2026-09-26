import QRCode from 'qrcode';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import type { RoomSnapshot } from '../../shared/protocol';
import { phaseOf, type Session, timeLabel } from '../../shared/session';
import { Applause } from '../components/Applause';
import { formatCode } from '../route';

interface StageProps {
  room: string;
  audienceLink: string;
  session: Session;
  snapshot: RoomSnapshot;
  header: ReactNode;
}

function useQrCode(text: string): string {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let current = true;
    void QRCode.toString(text, {
      type: 'svg',
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(result => {
      if (current) setSvg(`data:image/svg+xml,${encodeURIComponent(result)}`);
    });
    return () => {
      current = false;
    };
  }, [text]);
  return svg;
}

function stageLine(session: Session): string {
  if (session.paused) return 'Talk paused.';
  const phase = phaseOf(session);
  if (phase === 'listening')
    return session.openedAt === null
      ? `Scan to join. Voting opens at ${timeLabel(session.opensAt)}.`
      : 'Scan to join.';
  if (phase === 'voting') return 'Voting is open. Scan to vote.';
  if (phase === 'closed') return 'Voting is closed.';
  if (phase === 'ended') return 'Time is up.';
  return 'Scan to join.';
}

export function Stage({ room, audienceLink, session, snapshot, header }: StageProps): ReactNode {
  const qr = useQrCode(audienceLink);
  const phase = phaseOf(session);
  const name = snapshot.speaker;
  if (phase === 'applause')
    return <Applause header={header} text={name ? `Clap for ${name}.` : ''} />;
  const lobby = phase === 'lobby';
  const line = stageLine(session);
  return (
    <div className="event-screen">
      {header}
      <main className="stage">
        <div className="qr">{qr && <img src={qr} alt={`QR code for ${audienceLink}`} />}</div>
        <div className="stage-text">
          {name && (
            <>
              <p className="enter" key={`${lobby}`}>
                <span className={lobby ? 'live next' : 'live'}>{lobby ? 'Up next' : 'On air'}</span>
              </p>
              <p className="stage-name enter" key={name} style={{ '--i': 1 } as CSSProperties}>
                {name}
              </p>
            </>
          )}
          <h1 className="stage-line enter" key={line} style={{ '--i': 2 } as CSSProperties}>
            {line}
          </h1>
          {!lobby && (
            <p className="stage-time" role="timer">
              {timeLabel(session.elapsed)}
            </p>
          )}
        </div>
      </main>
      <p className="stage-host">
        Visit <strong>{location.host}</strong> and enter <strong>{formatCode(room)}</strong>
      </p>
    </div>
  );
}
