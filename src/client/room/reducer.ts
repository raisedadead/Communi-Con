import type { RoomSnapshot } from '../../shared/protocol';
import type { Action, Opinion } from '../../shared/session';

export type ErrorKind = 'notice' | 'retry' | 'final';

export interface RoomState {
  snapshot: RoomSnapshot | undefined;
  receivedAt: number;
  connected: boolean;
  pending: boolean;
  pendingVote: Opinion | null;
  fatal: string;
  final: boolean;
}

export type RoomEvent =
  | { type: 'reset' }
  | { type: 'invalid'; message: string }
  | { type: 'state'; snapshot: RoomSnapshot; at: number }
  | { type: 'connection'; connected: boolean }
  | { type: 'error'; message: string; kind: ErrorKind }
  | { type: 'sent'; action: Action }
  | { type: 'settle' };

export const initialRoomState: RoomState = {
  snapshot: undefined,
  receivedAt: 0,
  connected: false,
  pending: false,
  pendingVote: null,
  fatal: '',
  final: false,
};

const settled = { pending: false, pendingVote: null } as const;

function receive(state: RoomState, next: RoomSnapshot, at: number): RoomState {
  const previous = state.snapshot;
  const sameRound =
    previous !== undefined &&
    next.version === previous.version &&
    next.roundId === previous.roundId;
  const answered = !sameRound || (state.pendingVote !== null && next.opinion === state.pendingVote);
  return {
    ...state,
    ...(answered ? settled : {}),
    snapshot: sameRound ? { ...next, session: previous.session } : next,
    receivedAt: sameRound ? state.receivedAt : at,
  };
}

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'reset':
      return initialRoomState;
    case 'invalid':
      return { ...initialRoomState, fatal: event.message, final: true };
    case 'state':
      return receive(state, event.snapshot, event.at);
    case 'connection':
      return event.connected
        ? { ...state, connected: true }
        : { ...state, ...settled, connected: false };
    case 'error':
      return event.kind === 'notice'
        ? { ...state, ...settled }
        : { ...state, ...settled, fatal: event.message, final: event.kind === 'final' };
    case 'sent':
      return {
        ...state,
        pending: true,
        pendingVote: event.action.type === 'vote' ? event.action.opinion : null,
      };
    case 'settle':
      return { ...state, ...settled };
  }
}
