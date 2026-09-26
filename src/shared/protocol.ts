import type { Opinion, Session } from './session';

export type Role = 'audience' | 'stage' | 'admin';

export interface Results {
  keep: number;
  wrap: number;
  total: number;
}

export interface RoomSnapshot {
  type: 'state';
  roundId: string;
  version: number;
  session: Session;
  opinion: Opinion | null;
  participants: number;
  speaker: string;
  event: string;
  results?: Results;
}

export interface Reactions {
  type: 'reactions';
  keep: number;
  wrap: number;
}

export type ServerMessage = RoomSnapshot | Reactions | { type: 'error'; message: string };
