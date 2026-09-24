import PartySocket from 'partysocket';
import type { Action } from './session';
import type { Role, RoomSnapshot, ServerMessage } from './protocol';

interface Callbacks {
  state: (snapshot: RoomSnapshot) => void;
  connection: (connected: boolean) => void;
  error: (message: string) => void;
}

export interface RoomConnection {
  send: (action: Action) => boolean;
  close: () => void;
}

export function connectRoom(room: string, role: Role, key: string, callbacks: Callbacks): RoomConnection {
  const query: Record<string, string> = role === 'admin' ? { role, key } : { role };
  let socket: PartySocket | undefined;
  let snapshot: RoomSnapshot | undefined;
  let ready = false;
  let closed = false;

  function refresh(): void {
    if (!document.hidden) socket?.reconnect();
  }

  async function start(): Promise<void> {
    try {
      const response = await fetch(`/api/rooms/${room}/session?${new URLSearchParams(query)}`);
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error || 'Unable to reach the room. Check your connection and try again.');
      }
      snapshot = await response.json() as RoomSnapshot;
      if (closed) return;
      callbacks.state(snapshot);
      socket = new PartySocket({ host: location.host, party: 'room', room, query, maxEnqueuedMessages: 0, minReconnectionDelay: 500, maxReconnectionDelay: 5000 });
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'error') { callbacks.error(message.message); return; }
        snapshot = message;
        ready = true;
        callbacks.connection(true);
        callbacks.state(message);
      });
      socket.addEventListener('close', () => { ready = false; callbacks.connection(false); });
      document.addEventListener('visibilitychange', refresh);
    } catch (error) {
      callbacks.error(error instanceof Error ? error.message : 'Unable to reach the room. Check your connection and try again.');
    }
  }

  void start();
  return {
    send(action): boolean {
      if (!ready || !snapshot || !socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type: 'action', action, roundId: snapshot.roundId, version: snapshot.version }));
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
