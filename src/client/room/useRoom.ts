import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Role, RoomSnapshot } from '../../shared/protocol';
import { type Action, ballotOpen, type Session, transition } from '../../shared/session';
import { cheer } from '../fx';
import { rememberAdminRoom, roomPattern } from '../route';
import { connectRoom, type RoomConnection } from './connection';
import { initialRoomState, roomReducer, type RoomState } from './reducer';

export type Basis = Pick<RoomSnapshot, 'roundId' | 'version'>;

export interface Room extends RoomState {
  session: Session | undefined;
  act: (action: Action, basis?: Basis) => boolean;
}

const replyTimeout = 5000;

export function tickSession(
  snapshot: RoomSnapshot | undefined,
  receivedAt: number,
  now: number,
): Session | undefined {
  return snapshot
    ? transition(snapshot.session, { type: 'tick', seconds: (now - receivedAt) / 1000 })
    : undefined;
}

export function useNow(interval = 250): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

export function useRoom(
  room: string,
  role: Role,
  key: string,
  flash: (text: string) => void,
): Room {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState);
  const connection = useRef<RoomConnection | undefined>(undefined);
  const latest = useRef(state);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  const now = useNow();

  useEffect(() => {
    dispatch({ type: 'reset' });
    if (!roomPattern.test(room)) {
      const message =
        role === 'stage'
          ? 'This address is incomplete. Copy it from the Share card.'
          : 'This link is incomplete.';
      dispatch({ type: 'invalid', message });
      return;
    }
    let first = true;
    const socket = connectRoom(room, role, key, {
      state(snapshot) {
        if (role === 'admin' && first) rememberAdminRoom(room);
        first = false;
        dispatch({ type: 'state', snapshot, at: Date.now() });
      },
      reactions(message) {
        const { snapshot, receivedAt } = latest.current;
        const session = tickSession(snapshot, receivedAt, Date.now());
        if (!session || !ballotOpen(session) || document.hidden) return;
        cheer('keep', message.keep);
        cheer('wrap', message.wrap);
      },
      connection(connected) {
        dispatch({ type: 'connection', connected });
      },
      error(message, kind) {
        dispatch({ type: 'error', message, kind });
        if (kind === 'notice') flash(message);
      },
    });
    connection.current = socket;
    return () => socket.close();
  }, [room, role, key, flash]);

  useEffect(() => {
    if (!state.pending) clearTimeout(replyTimer.current);
  }, [state.pending]);

  const act = useCallback(
    (action: Action, basis?: Basis): boolean => {
      if (latest.current.pending) return false;
      if (!connection.current?.send(action, basis)) {
        flash('Not connected. Try again in a moment.');
        return false;
      }
      dispatch({ type: 'sent', action });
      latest.current = { ...latest.current, pending: true };
      clearTimeout(replyTimer.current);
      replyTimer.current = setTimeout(() => {
        dispatch({ type: 'settle' });
        flash('No reply. Check your connection and try again.');
      }, replyTimeout);
      return true;
    },
    [flash],
  );

  return { ...state, session: tickSession(state.snapshot, state.receivedAt, now), act };
}
