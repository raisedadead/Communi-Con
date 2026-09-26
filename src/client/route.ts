import type { Role } from '../shared/protocol';

export const roomPattern = /^\d{8}$/;
const keyPattern = /^[a-f0-9]{64}$/;

export interface Route {
  role: Role;
  room: string;
}

export function readRoute(): Route {
  const [, screen = '', slug = ''] = location.pathname.split('/');
  const role: Role = screen === 'admin' ? 'admin' : screen === 'stage' ? 'stage' : 'audience';
  const room = (slug || new URLSearchParams(location.search).get('room') || '').replaceAll('-', '');
  return { role, room };
}

export function storeAdminKey(room: string, key: string): void {
  localStorage.setItem(`cc-key:${room}`, key);
}

export function readAdminKey(room: string): string {
  const shared = new URLSearchParams(location.hash.slice(1)).get('key');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (roomPattern.test(room) && shared && keyPattern.test(shared)) return shared;
  return room ? localStorage.getItem(`cc-key:${room}`) || '' : '';
}

export function lastAdminRoom(): string | null {
  return localStorage.getItem('cc-room');
}

export function rememberAdminRoom(room: string, key: string): void {
  storeAdminKey(room, key);
  localStorage.setItem('cc-room', room);
}

export function formatCode(room: string): string {
  return `${room.slice(0, 4)}-${room.slice(4)}`;
}

export function links(room: string, key: string): Record<'audience' | 'stage' | 'admin', string> {
  return {
    audience: `${location.origin}/?room=${room}`,
    stage: `${location.origin}/stage/${formatCode(room)}`,
    admin: `${location.origin}/admin?room=${room}#key=${key}`,
  };
}
