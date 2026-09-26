import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { RoomSnapshot, ServerMessage } from '../shared/protocol';

const worker = exports as unknown as { default: Fetcher };
const origin = 'http://example.com';

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.default.fetch(new Request(`${origin}${path}`, init));
}

async function createRoom(): Promise<{ room: string; key: string }> {
  const response = await call('/api/rooms', {
    method: 'POST',
    headers: { Origin: origin },
    body: JSON.stringify({ passphrase: 'test passphrase' }),
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

describe('room socket', () => {
  it('counts an audience vote for the co-chairs', async () => {
    const { room, key } = await createRoom();
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
    snapshot = (await next(
      admin,
      message => state(message) && message.session.openedAt !== null,
    )) as RoomSnapshot;

    const cookie =
      (await call(`/api/rooms/${room}/session?role=audience`)).headers
        .get('Set-Cookie')
        ?.split(';')[0] ?? '';
    const audience = await join(room, 'role=audience', cookie);
    await next(audience, state);
    audience.send(
      JSON.stringify({
        type: 'action',
        action: { type: 'vote', opinion: 'keep' },
        roundId: snapshot.roundId,
      }),
    );

    const counted = (await next(
      admin,
      message => state(message) && message.results?.total === 1,
    )) as RoomSnapshot;
    expect(counted.results).toEqual({ keep: 1, wrap: 0, total: 1 });
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
