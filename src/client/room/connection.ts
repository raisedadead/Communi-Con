import { PartySocket } from 'partysocket';
import type { Reactions, Role, RoomSnapshot, ServerMessage } from '../../shared/protocol';
import type { Action } from '../../shared/session';

interface Callbacks {
  state: (snapshot: RoomSnapshot) => void;
  reactions: (reactions: Reactions) => void;
  connection: (connected: boolean) => void;
  error: (message: string, kind: 'notice' | 'retry' | 'final') => void;
}

export interface RoomConnection {
  send: (action: Action, basis?: Pick<RoomSnapshot, 'roundId' | 'version'>) => boolean;
  close: () => void;
}

const unreachable = 'Unable to reach the room. Check your connection and try again.';

export function connectRoom(
  room: string,
  role: Role,
  key: string,
  callbacks: Callbacks,
): RoomConnection {
  const query: Record<string, string> = role === 'admin' ? { role, key } : { role };
  let socket: PartySocket | undefined;
  let snapshot: RoomSnapshot | undefined;
  let ready = false;
  let closed = false;
  let hiddenAt = 0;

  function refresh(): void {
    if (document.hidden) hiddenAt = Date.now();
    else if (Date.now() - hiddenAt > 10_000) socket?.reconnect();
  }

  async function start(): Promise<void> {
    try {
      const response = await fetch(`/api/rooms/${room}/session?${new URLSearchParams(query)}`);
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        callbacks.error(body.error || unreachable, response.status >= 500 ? 'retry' : 'final');
        return;
      }
      snapshot = (await response.json()) as RoomSnapshot;
      if (closed) return;
      callbacks.state(snapshot);
      socket = new PartySocket({
        host: location.host,
        party: 'room',
        room,
        query,
        maxEnqueuedMessages: 0,
        minReconnectionDelay: 500,
        maxReconnectionDelay: 5000,
        shouldReconnectOnClose: event => event.code !== 1008,
      });
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'error') {
          callbacks.error(message.message, 'notice');
          return;
        }
        if (message.type === 'reactions') {
          callbacks.reactions(message);
          return;
        }
        snapshot = message;
        ready = true;
        callbacks.connection(true);
        callbacks.state(message);
      });
      socket.addEventListener('close', event => {
        ready = false;
        callbacks.connection(false);
        if (event.code === 1008)
          callbacks.error(
            'Unable to join the room. Allow cookies for this site, then reload the page.',
            'retry',
          );
      });
      document.addEventListener('visibilitychange', refresh);
    } catch {
      callbacks.error(unreachable, 'retry');
    }
  }

  void start();
  return {
    send(action, basis = snapshot): boolean {
      if (!ready || !basis || !socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(
        JSON.stringify({ type: 'action', action, roundId: basis.roundId, version: basis.version }),
      );
      return true;
    },
    close(): void {
      closed = true;
      ready = false;
      document.removeEventListener('visibilitychange', refresh);
      socket?.close();
    },
  };
}
