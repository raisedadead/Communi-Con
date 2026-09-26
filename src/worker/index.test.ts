import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import type { RoomSnapshot, ServerMessage } from '../shared/protocol';
import { type Env, type Room, voteLimit } from './room';

const worker = exports as unknown as { default: Fetcher };
const origin = 'http://example.com';

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('CF-Connecting-IP')) headers.set('CF-Connecting-IP', crypto.randomUUID());
  return worker.default.fetch(new Request(`${origin}${path}`, { ...init, headers }));
}

async function createRoom(event?: string): Promise<{ room: string; key: string }> {
  const response = await call('/api/rooms', {
    method: 'POST',
    headers: { Origin: origin },
    body: JSON.stringify({ passphrase: 'test passphrase', event }),
  });
  expect(response.status).toBe(201);
  return response.json();
}

async function join(room: string, query: string, cookie = ''): Promise<WebSocket> {
  const response = await call(`/parties/room/${room}?${query}`, {
    headers: { Upgrade: 'websocket', Origin: origin, Cookie: cookie },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`No socket: ${response.status}`);
  socket.accept();
  return socket;
}

function next(
  socket: WebSocket,
  match: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  return new Promise(resolve => {
    const listener = (event: MessageEvent): void => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (!match(message)) return;
      socket.removeEventListener('message', listener);
      resolve(message);
    };
    socket.addEventListener('message', listener);
  });
}

const state = (message: ServerMessage): message is RoomSnapshot => message.type === 'state';

async function statuses(count: number, path: string, init: RequestInit = {}): Promise<number[]> {
  const headers = { ...init.headers, 'CF-Connecting-IP': crypto.randomUUID() };
  const result: number[] = [];
  for (let index = 0; index < count; index += 1)
    result.push((await call(path, { ...init, headers })).status);
  return result;
}

describe('rate limits', () => {
  it('limits room creation per address', async () => {
    const tries = await statuses(11, '/api/rooms', {
      method: 'POST',
      headers: { Origin: origin },
      body: JSON.stringify({ passphrase: 'wrong' }),
    });
    expect(tries.slice(0, 10).every(status => status === 403)).toBe(true);
    expect(tries[10]).toBe(429);
  });

  it('limits room sessions per address', async () => {
    const tries = await statuses(101, '/api/rooms/00000000/session?role=stage');
    expect(tries.slice(0, 100).every(status => status === 404)).toBe(true);
    expect(tries[100]).toBe(429);
  });

  it('limits room sockets per address', async () => {
    const tries = await statuses(101, '/parties/room/00000000?role=stage', {
      headers: { Upgrade: 'websocket', Origin: origin },
    });
    expect(tries.slice(0, 100).every(status => status === 101)).toBe(true);
    expect(tries[100]).toBe(429);
  });
});

describe('room creation', () => {
  it('refuses a request from another origin', async () => {
    const response = await call('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ passphrase: 'test passphrase' }),
    });
    expect(response.status).toBe(403);
  });

  it('refuses a wrong passphrase', async () => {
    const response = await call('/api/rooms', {
      method: 'POST',
      headers: { Origin: origin },
      body: JSON.stringify({ passphrase: 'wrong' }),
    });
    expect(response.status).toBe(403);
  });

  it('returns an 8-digit room and a co-chair key', async () => {
    const { room, key } = await createRoom();
    expect(room).toMatch(/^\d{8}$/);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});

async function eventOf(room: string): Promise<string> {
  const response = await call(`/api/rooms/${room}/session?role=stage`);
  return ((await response.json()) as RoomSnapshot).event;
}

describe('event name', () => {
  it('sends the cleaned event name in the snapshot', async () => {
    const { room } = await createRoom('  Demo\u0000   Day 2026 ');
    expect(await eventOf(room)).toBe('Demo Day 2026');
  });

  it('cuts the event name to 60 characters', async () => {
    const { room } = await createRoom('é'.repeat(70));
    expect(await eventOf(room)).toBe('é'.repeat(60));
  });

  it('sends an empty event name when the co-chair gives none', async () => {
    const { room } = await createRoom();
    expect(await eventOf(room)).toBe('');
  });
});

describe('room session', () => {
  it('reports an unknown room', async () => {
    expect((await call('/api/rooms/00000000/session?role=stage')).status).toBe(404);
  });

  it('gives each audience browser an identity cookie', async () => {
    const { room } = await createRoom();
    const response = await call(`/api/rooms/${room}/session?role=audience`);
    expect(response.headers.get('Set-Cookie')).toMatch(/^cc_participant=[a-f0-9]{64};/);
    const snapshot = await response.json<RoomSnapshot>();
    expect(snapshot.session.mode).toBe('lobby');
    expect(snapshot.results).toBeUndefined();
  });

  it('shows totals only with a valid co-chair key', async () => {
    const { room, key } = await createRoom();
    expect((await call(`/api/rooms/${room}/session?role=admin&key=${'0'.repeat(64)}`)).status).toBe(
      403,
    );
    const snapshot = await (
      await call(`/api/rooms/${room}/session?role=admin&key=${key}`)
    ).json<RoomSnapshot>();
    expect(snapshot.results).toEqual({ keep: 0, wrap: 0, total: 0 });
  });
});

async function openVoting(room: string, key: string): Promise<RoomSnapshot> {
  const admin = await join(room, `role=admin&key=${key}`);
  let snapshot = (await next(admin, state)) as RoomSnapshot;
  const send = (action: object): void =>
    admin.send(
      JSON.stringify({
        type: 'action',
        action,
        roundId: snapshot.roundId,
        version: snapshot.version,
      }),
    );
  send({ type: 'start' });
  snapshot = (await next(
    admin,
    message => state(message) && message.session.mode === 'talk',
  )) as RoomSnapshot;
  send({ type: 'open' });
  return (await next(
    admin,
    message => state(message) && message.session.openedAt !== null,
  )) as RoomSnapshot;
}

async function joinAudience(room: string): Promise<WebSocket> {
  const cookie =
    (await call(`/api/rooms/${room}/session?role=audience`)).headers
      .get('Set-Cookie')
      ?.split(';')[0] ?? '';
  const audience = await join(room, 'role=audience', cookie);
  await next(audience, state);
  return audience;
}

function vote(audience: WebSocket, roundId: string, opinion = 'keep'): void {
  audience.send(JSON.stringify({ type: 'action', action: { type: 'vote', opinion }, roundId }));
}

function roomStub(room: string): DurableObjectStub<Room> {
  return (env as unknown as Env).ROOM.getByName(room);
}

describe('room socket', () => {
  it('counts an audience vote for the co-chairs', async () => {
    const { room, key } = await createRoom();
    const { roundId } = await openVoting(room, key);
    const admin = await join(room, `role=admin&key=${key}`);
    await next(admin, state);
    vote(await joinAudience(room), roundId);
    const counted = (await next(
      admin,
      message => state(message) && message.results?.total === 1,
    )) as RoomSnapshot;
    expect(counted.results).toEqual({ keep: 1, wrap: 0, total: 1 });
  });

  it('refuses a new voter when the round is full', async () => {
    const { room, key } = await createRoom();
    const { roundId } = await openVoting(room, key);
    await runInDurableObject(roomStub(room), instance => {
      const { votes } = (instance as unknown as { room: { votes: Record<string, string> } }).room;
      for (let index = 0; index < voteLimit; index += 1) votes[String(index)] = 'keep';
    });
    const audience = await joinAudience(room);
    vote(audience, roundId);
    expect(await next(audience, message => message.type === 'error')).toEqual({
      type: 'error',
      message: 'This vote is full.',
    });
  });

  it('does not rewrite the room for an unchanged vote', async () => {
    const { room, key } = await createRoom();
    const { roundId } = await openVoting(room, key);
    const audience = await joinAudience(room);
    vote(audience, roundId);
    await next(audience, message => state(message) && message.opinion === 'keep');
    const put = await runInDurableObject(roomStub(room), (_, context) =>
      vi.spyOn(context.storage, 'put'),
    );
    vote(audience, roundId);
    await next(audience, state);
    expect(put).not.toHaveBeenCalled();
    vote(audience, roundId, 'wrap');
    await next(audience, message => state(message) && message.opinion === 'wrap');
    expect(put).toHaveBeenCalledOnce();
  });

  it('refuses a talk control from the audience', async () => {
    const { room } = await createRoom();
    const cookie =
      (await call(`/api/rooms/${room}/session?role=audience`)).headers
        .get('Set-Cookie')
        ?.split(';')[0] ?? '';
    const audience = await join(room, 'role=audience', cookie);
    const snapshot = (await next(audience, state)) as RoomSnapshot;
    audience.send(
      JSON.stringify({
        type: 'action',
        action: { type: 'start' },
        roundId: snapshot.roundId,
        version: snapshot.version,
      }),
    );
    expect(await next(audience, message => message.type === 'error')).toEqual({
      type: 'error',
      message: 'Only a co-chair can run the talk.',
    });
  });
});
