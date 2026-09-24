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
  results?: Results;
}

export type ServerMessage = RoomSnapshot | { type: 'error'; message: string };
