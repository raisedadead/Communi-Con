import type { Action } from '../shared/session';
import { validTiming } from '../shared/session';

export function cleanName(name: string): string {
  return [
    ...name
      .replace(/\s+/g, ' ')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim(),
  ]
    .slice(0, 60)
    .join('')
    .trim();
}

export function parseAction(value: unknown): Action | null {
  if (!value || typeof value !== 'object') return null;
  const action = value as Record<string, unknown>;
  if (action.type === 'start')
    return typeof action.speaker === 'string'
      ? { type: 'start', speaker: cleanName(action.speaker) }
      : { type: 'start' };
  if (
    action.type === 'reset' ||
    action.type === 'pause' ||
    action.type === 'applause' ||
    action.type === 'open'
  )
    return { type: action.type };
  if (action.type === 'timing') {
    const { length, opensAt, lasts } = action;
    return typeof length === 'number' &&
      typeof opensAt === 'number' &&
      typeof lasts === 'number' &&
      validTiming({ length, opensAt, lasts })
      ? { type: 'timing', length, opensAt, lasts }
      : null;
  }
  if (action.type === 'nudge' && (action.seconds === 60 || action.seconds === -60))
    return { type: 'nudge', seconds: action.seconds };
  if (action.type === 'speaker' && typeof action.name === 'string')
    return { type: 'speaker', name: cleanName(action.name) };
  if (action.type === 'vote' && (action.opinion === 'keep' || action.opinion === 'wrap'))
    return { type: 'vote', opinion: action.opinion };
  return null;
}
