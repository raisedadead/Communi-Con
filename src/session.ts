export type Opinion = 'keep' | 'wrap';
export type Phase = 'lobby' | 'listening' | 'voting' | 'closed' | 'applause' | 'ended';

export interface Timing {
  length: number;
  opensAt: number;
  lasts: number;
}

export interface Session extends Timing {
  mode: 'lobby' | 'talk';
  elapsed: number;
  paused: boolean;
  applause: boolean;
  openedAt: number | null;
  planned: number;
}

export type Action =
  | { type: 'start'; speaker?: string }
  | { type: 'reset' }
  | { type: 'tick'; seconds: number }
  | { type: 'nudge'; seconds: number }
  | { type: 'pause' }
  | { type: 'vote'; opinion: Opinion }
  | { type: 'applause' }
  | { type: 'speaker'; name: string }
  | { type: 'open' }
  | ({ type: 'timing' } & Timing);

export function initialSession(): Session {
  return { mode: 'lobby', elapsed: 0, paused: false, applause: false, openedAt: null, length: 600, planned: 600, opensAt: 300, lasts: 300 };
}

export function timingProblem({ length, opensAt, lasts }: Timing): keyof Timing | null {
  if (!Number.isInteger(length) || length < 60 || length > 7200) return 'length';
  if (!Number.isInteger(opensAt) || opensAt < 0 || opensAt >= length) return 'opensAt';
  if (!Number.isInteger(lasts) || lasts < 15 || lasts > 7200) return 'lasts';
  return null;
}

export function validTiming(timing: Timing): boolean {
  return timingProblem(timing) === null;
}

export function votingWindow(session: Session): { from: number; to: number } {
  const from = session.openedAt ?? session.opensAt;
  return { from, to: Math.min(session.length, from + session.lasts) };
}

export function phaseOf(session: Session): Phase {
  if (session.mode === 'lobby') return 'lobby';
  if (session.applause) return 'applause';
  if (session.elapsed >= session.length) return 'ended';
  const { from, to } = votingWindow(session);
  if (session.elapsed < from) return 'listening';
  return session.elapsed < to ? 'voting' : 'closed';
}

export function ballotOpen(session: Session): boolean {
  return !session.paused && phaseOf(session) === 'voting';
}

export function canNudge(session: Session, seconds: number): boolean {
  const length = session.length + seconds;
  return session.mode === 'talk' && !session.applause && length >= 60 && length <= 7200 && length > session.elapsed && (session.openedAt ?? session.opensAt) < length;
}

export function transition(session: Session, action: Action): Session {
  const idle = { elapsed: 0, paused: false, applause: false, openedAt: null, length: session.planned };
  if (action.type === 'start') return { ...session, ...idle, mode: 'talk' };
  if (action.type === 'reset') return { ...session, ...idle, mode: 'lobby' };
  if (action.type === 'timing') {
    const length = action.length === session.planned && action.opensAt < session.length ? session.length : action.length;
    const openedAt = action.opensAt === session.opensAt && session.openedAt !== null && session.openedAt < length ? session.openedAt : null;
    return { ...session, length, planned: action.length, opensAt: action.opensAt, lasts: action.lasts, openedAt, elapsed: Math.min(session.elapsed, length) };
  }
  if (session.mode !== 'talk' || session.applause) return session;
  const phase = phaseOf(session);
  if (action.type === 'pause' && (session.paused || phase !== 'ended')) return { ...session, paused: !session.paused };
  if (action.type === 'tick' && !session.paused) return { ...session, elapsed: Math.min(session.length, session.elapsed + Math.max(0, action.seconds)) };
  if (action.type === 'applause') return { ...session, paused: false, applause: true };
  if (action.type === 'open' && (phase === 'listening' || phase === 'closed')) return { ...session, openedAt: session.elapsed };
  if (action.type === 'nudge' && canNudge(session, action.seconds)) return { ...session, length: session.length + action.seconds };
  return session;
}

export function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
