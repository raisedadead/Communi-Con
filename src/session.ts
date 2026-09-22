export type Opinion = 'keep' | 'wrap';
export type Phase = 'practice' | 'listening' | 'voting' | 'eligible' | 'applause' | 'ended';

export interface Session {
  mode: 'practice' | 'talk';
  elapsed: number;
  paused: boolean;
  applause: boolean;
  opinion: Opinion | null;
  crowdWrap: number;
  joined: boolean;
}

export type Action =
  | { type: 'start' }
  | { type: 'reset' }
  | { type: 'tick'; seconds: number }
  | { type: 'seek'; seconds: number }
  | { type: 'pause' }
  | { type: 'vote'; opinion: Opinion }
  | { type: 'applause' }
  | { type: 'crowd'; wrap: number }
  | { type: 'join' };

export function initialSession(): Session {
  return { mode: 'practice', elapsed: 0, paused: false, applause: false, opinion: null, crowdWrap: 24, joined: false };
}

export function phaseOf(session: Session): Phase {
  if (session.mode === 'practice') return 'practice';
  if (session.applause) return 'applause';
  if (session.elapsed >= 600) return 'ended';
  if (session.elapsed >= 480) return 'eligible';
  if (session.elapsed >= 300) return 'voting';
  return 'listening';
}

export function transition(session: Session, action: Action): Session {
  if (action.type === 'start') return { ...initialSession(), mode: 'talk' };
  if (action.type === 'reset') return initialSession();
  if (action.type === 'join' && session.mode === 'practice') return { ...session, joined: true };
  if (action.type === 'crowd') return { ...session, crowdWrap: Math.min(100, Math.max(0, action.wrap)) };
  if (action.type === 'pause' && session.mode === 'talk' && !session.applause && session.elapsed < 600) return { ...session, paused: !session.paused };
  if (action.type === 'tick' && session.mode === 'talk' && !session.paused && !session.applause) {
    return { ...session, elapsed: Math.min(600, session.elapsed + Math.max(0, action.seconds)) };
  }
  if (action.type === 'applause' && ['eligible', 'ended'].includes(phaseOf(session)) && !session.paused) {
    return { ...session, applause: true, paused: false };
  }
  if (action.type === 'seek' && session.mode === 'talk') {
    return { ...session, elapsed: Math.min(600, Math.max(0, action.seconds)), paused: false, applause: false, opinion: action.seconds < 300 ? null : session.opinion };
  }
  if (action.type === 'vote' && ['voting', 'eligible'].includes(phaseOf(session)) && !session.paused) {
    return { ...session, opinion: action.opinion };
  }
  return session;
}

export function readSession(value: string | null): Session {
  if (!value) return initialSession();
  try {
    const data: unknown = JSON.parse(value);
    if (typeof data !== 'object' || data === null) return initialSession();
    const sample = data as Record<string, unknown>;
    if (
      !['practice', 'talk'].includes(String(sample.mode)) ||
      typeof sample.elapsed !== 'number' || !Number.isFinite(sample.elapsed) || sample.elapsed < 0 || sample.elapsed > 600 ||
      typeof sample.paused !== 'boolean' || typeof sample.applause !== 'boolean' ||
      typeof sample.joined !== 'boolean' ||
      (sample.opinion !== null && sample.opinion !== 'keep' && sample.opinion !== 'wrap') ||
      typeof sample.crowdWrap !== 'number' || !Number.isFinite(sample.crowdWrap) || sample.crowdWrap < 0 || sample.crowdWrap > 100
    ) return initialSession();
    return sample as unknown as Session;
  } catch {
    return initialSession();
  }
}

export function timeLabel(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
