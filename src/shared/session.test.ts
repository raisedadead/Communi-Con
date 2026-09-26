import { describe, expect, it } from 'vitest';
import {
  canNudge,
  initialSession,
  phaseOf,
  type Session,
  timeLabel,
  timingProblem,
  transition,
} from './session';

const talk = (overrides: Partial<Session> = {}): Session => ({
  ...transition(initialSession(), { type: 'start' }),
  ...overrides,
});

describe('phaseOf', () => {
  it('walks lobby, listening, voting, closed and ended over a default talk', () => {
    expect(phaseOf(initialSession())).toBe('lobby');
    expect(phaseOf(talk({ elapsed: 0 }))).toBe('listening');
    expect(phaseOf(talk({ elapsed: 300 }))).toBe('voting');
    expect(phaseOf(talk({ elapsed: 599, lasts: 120 }))).toBe('closed');
    expect(phaseOf(talk({ elapsed: 600 }))).toBe('ended');
  });

  it('shows applause over every other talk phase', () => {
    expect(phaseOf(talk({ elapsed: 300, applause: true }))).toBe('applause');
  });
});

describe('transition', () => {
  it('opens voting now while listening', () => {
    const next = transition(talk({ elapsed: 42 }), { type: 'open' });
    expect(next.openedAt).toBe(42);
    expect(phaseOf(next)).toBe('voting');
  });

  it('stops the clock at the talk length and while paused', () => {
    expect(transition(talk({ elapsed: 590 }), { type: 'tick', seconds: 30 }).elapsed).toBe(600);
    expect(transition(talk({ paused: true }), { type: 'tick', seconds: 30 }).elapsed).toBe(0);
  });

  it('ignores talk controls after the applause cue', () => {
    const cued = transition(talk(), { type: 'applause' });
    expect(transition(cued, { type: 'nudge', seconds: 60 })).toBe(cued);
  });

  it('changes only the current talk length with a nudge', () => {
    const next = transition(talk(), { type: 'nudge', seconds: -60 });
    expect(next.length).toBe(540);
    expect(transition(next, { type: 'start' }).length).toBe(600);
  });

  it('keeps a nudged length when only the voting window changes', () => {
    const nudged = transition(talk(), { type: 'nudge', seconds: 60 });
    const next = transition(nudged, { type: 'timing', length: 600, opensAt: 200, lasts: 100 });
    expect(next.length).toBe(660);
    expect(next.planned).toBe(600);
  });
});

describe('canNudge', () => {
  it('refuses a length below the elapsed time or the voting start', () => {
    expect(canNudge(talk({ elapsed: 590 }), -60)).toBe(false);
    expect(canNudge(talk({ length: 360, planned: 360 }), -60)).toBe(false);
    expect(canNudge(talk(), 60)).toBe(true);
  });
});

describe('timingProblem', () => {
  it('names the first invalid field', () => {
    expect(timingProblem({ length: 30, opensAt: 0, lasts: 60 })).toBe('length');
    expect(timingProblem({ length: 600, opensAt: 600, lasts: 60 })).toBe('opensAt');
    expect(timingProblem({ length: 600, opensAt: 0, lasts: 10 })).toBe('lasts');
    expect(timingProblem({ length: 600, opensAt: 300, lasts: 300 })).toBeNull();
  });
});

describe('timeLabel', () => {
  it('formats seconds as mm:ss', () => {
    expect(timeLabel(0)).toBe('00:00');
    expect(timeLabel(605.9)).toBe('10:05');
  });
});
