import { describe, expect, it } from 'vitest';
import type { RoomSnapshot } from '../../shared/protocol';
import { initialSession } from '../../shared/session';
import { type RoomState, initialRoomState, roomReducer } from './reducer';

const snapshot = (overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  type: 'state',
  roundId: 'round',
  version: 1,
  session: initialSession(),
  opinion: null,
  participants: 0,
  speaker: '',
  ...overrides,
});

const receive = (state: RoomState, next: RoomSnapshot, at = 1000): RoomState =>
  roomReducer(state, { type: 'state', snapshot: next, at });

describe('roomReducer', () => {
  it('settles a pending action when the version changes', () => {
    const joined = receive(initialRoomState, snapshot());
    const sent = roomReducer(joined, { type: 'sent', action: { type: 'pause' } });
    expect(sent.pending).toBe(true);
    expect(receive(sent, snapshot({ version: 2 })).pending).toBe(false);
  });

  it('settles each vote when the echoed opinion matches, not only the first', () => {
    let state = receive(initialRoomState, snapshot());
    for (const opinion of ['keep', 'wrap'] as const) {
      state = roomReducer(state, { type: 'sent', action: { type: 'vote', opinion } });
      expect(state.pendingVote).toBe(opinion);
      state = receive(state, snapshot({ opinion }));
      expect(state.pending).toBe(false);
      expect(state.pendingVote).toBeNull();
    }
  });

  it('keeps the local clock basis for a same-version snapshot', () => {
    const first = receive(initialRoomState, snapshot({ participants: 1 }), 1000);
    const next = receive(
      first,
      snapshot({ participants: 5, session: { ...initialSession(), elapsed: 99 } }),
      5000,
    );
    expect(next.receivedAt).toBe(1000);
    expect(next.snapshot?.session.elapsed).toBe(0);
    expect(next.snapshot?.participants).toBe(5);
  });

  it('settles on disconnect and on an error', () => {
    const sent = roomReducer(receive(initialRoomState, snapshot()), {
      type: 'sent',
      action: { type: 'open' },
    });
    expect(roomReducer(sent, { type: 'connection', connected: false }).pending).toBe(false);
    const failed = roomReducer(sent, { type: 'error', message: 'Gone.', kind: 'final' });
    expect(failed).toMatchObject({ pending: false, fatal: 'Gone.', final: true });
  });

  it('keeps a notice error out of the fatal state', () => {
    const state = roomReducer(initialRoomState, {
      type: 'error',
      message: 'Voting is closed.',
      kind: 'notice',
    });
    expect(state.fatal).toBe('');
  });
});
