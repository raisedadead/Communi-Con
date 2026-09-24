export type Opinion = 'keep' | 'wrap';
export type Phase = 'lobby' | 'listening' | 'voting' | 'eligible' | 'applause' | 'ended';

export interface Session {
  mode: 'lobby' | 'talk';
  elapsed: number;
  paused: boolean;
  applause: boolean;
}

export type Action =
  | { type: 'start' }
  | { type: 'reset' }
  | { type: 'tick'; seconds: number }
  | { type: 'seek'; seconds: number }
  | { type: 'pause' }
  | { type: 'vote'; opinion: Opinion }
  | { type: 'applause' };

export function initialSession(): Session {
  return { mode: 'lobby', elapsed: 0, paused: false, applause: false };
}

export function phaseOf(session: Session): Phase {
  if (session.mode === 'lobby') return 'lobby';
  if (session.applause) return 'applause';
  if (session.elapsed >= 600) return 'ended';
  if (session.elapsed >= 480) return 'eligible';
  if (session.elapsed >= 300) return 'voting';
  return 'listening';
}

export function ballotOpen(session: Session): boolean {
  const phase = phaseOf(session);
  return !session.paused && (phase === 'voting' || phase === 'eligible');
}

export function transition(session: Session, action: Action): Session {
  if (action.type === 'start') return { ...initialSession(), mode: 'talk' };
  if (action.type === 'reset') return initialSession();
  if (action.type === 'pause' && session.mode === 'talk' && !session.applause && session.elapsed < 600) return { ...session, paused: !session.paused };
  if (action.type === 'tick' && session.mode === 'talk' && !session.paused && !session.applause) {
    return { ...session, elapsed: Math.min(600, session.elapsed + Math.max(0, action.seconds)) };
  }
  if (action.type === 'applause' && ['eligible', 'ended'].includes(phaseOf(session)) && !session.paused) {
    return { ...session, applause: true };
  }
  if (action.type === 'seek' && session.mode === 'talk') {
    return { ...session, elapsed: Math.min(600, Math.max(0, action.seconds)), paused: false, applause: false };
  }
  return session;
}

export function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
