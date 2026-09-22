import type { Session } from './session';

export type Role = 'audience' | 'stage' | 'admin';

export interface Member {
  id: string;
  joined: boolean;
}

export interface Results {
  keep: number;
  wrap: number;
  total: number;
}

export interface RoomSnapshot {
  type: 'state';
  room: string;
  roundId: string;
  version: number;
  session: Session;
  participantId: string | null;
  participants: number;
  members: Member[];
  joinUrl: string;
  results?: Results;
}

export type ServerMessage = RoomSnapshot | { type: 'error'; message: string };
