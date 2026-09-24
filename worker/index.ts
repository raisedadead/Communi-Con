import { routePartykitRequest, Server } from 'partyserver';
import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import { ballotOpen, initialSession, transition } from '../src/session';
import type { Action, Opinion, Session } from '../src/session';
import type { Reactions, Results, Role, RoomSnapshot } from '../src/protocol';

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  ADMIN_PASSPHRASE?: string;
}

interface RoomRecord {
  hostHash: string;
  session: Session;
  clockAt: number;
  roundId: string;
  version: number;
  votes: Record<string, Opinion>;
  speaker?: string;
}

interface Peer {
  role: Role;
  participant: string | null;
}

const roomPattern = /^[a-f0-9]{32}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
const reactionLimit = 12;

function token(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await digest(value)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function passphraseMatches(request: Request, expected: string): Promise<boolean> {
  const body: unknown = await request.json().catch(() => null);
  const given = body && typeof body === 'object' && 'passphrase' in body && typeof body.passphrase === 'string' ? body.passphrase.trim() : '';
  const [a, b] = await Promise.all([digest(given), digest(expected.trim())]);
  return given !== '' && crypto.subtle.timingSafeEqual(a, b);
}

function cookie(request: Request, name: string): string {
  return request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

function setCookie(name: string, value: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? '; Secure' : ''}`;
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function roleOf(request: Request): Role | null {
  const role = new URL(request.url).searchParams.get('role');
  return role === 'audience' || role === 'stage' || role === 'admin' ? role : null;
}

function sameOrigin(request: Request): boolean {
  return request.headers.get('Origin') === new URL(request.url).origin;
}

function cleanName(name: string): string {
  return [...name.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, 60).join('').trim();
}

function parseAction(value: unknown): Action | null {
  if (!value || typeof value !== 'object') return null;
  const action = value as Record<string, unknown>;
  if (action.type === 'start') return typeof action.speaker === 'string' ? { type: 'start', speaker: cleanName(action.speaker) } : { type: 'start' };
  if (action.type === 'reset' || action.type === 'pause' || action.type === 'applause') return { type: action.type };
  if (action.type === 'nudge' && (action.seconds === 60 || action.seconds === -60)) return { type: 'nudge', seconds: action.seconds };
  if (action.type === 'speaker' && typeof action.name === 'string') return { type: 'speaker', name: cleanName(action.name) };
  if (action.type === 'vote' && (action.opinion === 'keep' || action.opinion === 'wrap')) return { type: 'vote', opinion: action.opinion };
  return null;
}

export class Room extends Server<Env> {
  static options = { hibernate: true };
  private room: RoomRecord | undefined;
  private presenceTimer: ReturnType<typeof setTimeout> | undefined;
  private reactionTimer: ReturnType<typeof setTimeout> | undefined;
  private reactions: Record<Opinion, number> = { keep: 0, wrap: 0 };

  async onStart(): Promise<void> {
    this.room = await this.ctx.storage.get<RoomRecord>('room');
  }

  private current(): Session {
    const record = this.room!;
    return transition(record.session, { type: 'tick', seconds: Math.max(0, (Date.now() - record.clockAt) / 1000) });
  }

  private async peer(request: Request): Promise<Peer | null> {
    const role = roleOf(request);
    if (!role || !this.room) return null;
    if (role === 'admin') {
      const key = new URL(request.url).searchParams.get('key') || '';
      return tokenPattern.test(key) && await hash(key) === this.room.hostHash ? { role, participant: null } : null;
    }
    if (role === 'stage') return { role, participant: null };
    const identity = cookie(request, 'cc_participant');
    return tokenPattern.test(identity) ? { role, participant: await hash(identity) } : null;
  }

  private peers(role: Role): Connection<Peer>[] {
    return [...this.getConnections<Peer>(role)].filter(connection => connection.state?.role === role);
  }

  private participants(): number {
    return new Set(this.peers('audience').map(connection => connection.state!.participant)).size;
  }

  private snapshot(peer: Peer, participants: number): RoomSnapshot {
    const record = this.room!;
    const snapshot: RoomSnapshot = {
      type: 'state', roundId: record.roundId, version: record.version, session: this.current(),
      opinion: peer.participant ? record.votes[peer.participant] || null : null, participants, speaker: record.speaker || '',
    };
    if (peer.role === 'admin') {
      const votes = Object.values(record.votes);
      const results: Results = { keep: votes.filter(vote => vote === 'keep').length, wrap: votes.filter(vote => vote === 'wrap').length, total: votes.length };
      snapshot.results = results;
    }
    return snapshot;
  }

  private send(connections: Iterable<Connection<Peer>>): void {
    const participants = this.participants();
    for (const connection of new Set(connections)) {
      if (connection.state && connection.readyState === WebSocket.READY_STATE_OPEN) connection.send(JSON.stringify(this.snapshot(connection.state, participants)));
    }
  }

  private watchers(): Connection<Peer>[] {
    return [...this.peers('admin'), ...this.peers('stage')];
  }

  private presence(joined?: Connection<Peer>): void {
    this.send(joined ? [joined, ...this.watchers()] : this.watchers());
    this.presenceTimer ??= setTimeout(() => {
      this.presenceTimer = undefined;
      if (this.room) this.send(this.peers('audience'));
    }, 3000);
  }

  private react(opinion: Opinion): void {
    this.reactions[opinion] = Math.min(reactionLimit, this.reactions[opinion] + 1);
    this.reactionTimer ??= setTimeout(() => {
      const message: Reactions = { type: 'reactions', ...this.reactions };
      this.reactionTimer = undefined;
      this.reactions = { keep: 0, wrap: 0 };
      for (const connection of [...this.peers('audience'), ...this.peers('stage')]) {
        if (connection.readyState === WebSocket.READY_STATE_OPEN) connection.send(JSON.stringify(message));
      }
    }, 1000);
  }

  private async schedule(): Promise<void> {
    const session = this.current();
    const boundary = [300, 480, 600].find(seconds => seconds > session.elapsed);
    if (session.mode === 'talk' && !session.paused && !session.applause && boundary) {
      await this.ctx.storage.setAlarm(Date.now() + (boundary - session.elapsed) * 1000);
    } else await this.ctx.storage.deleteAlarm();
  }

  getConnectionTags(_connection: Connection, context: ConnectionContext): string[] {
    return [roleOf(context.request) || 'unknown'];
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/initialize' && request.method === 'POST') {
      if (this.room) return json({ error: 'Room already exists.' }, 409);
      const { hostHash } = await request.json<{ hostHash: string }>();
      this.room = { hostHash, session: initialSession(), clockAt: Date.now(), roundId: crypto.randomUUID(), version: 0, votes: {} };
      await this.ctx.storage.put('room', this.room);
      return json({ room: this.name }, 201);
    }
    if (!this.room) return json({ error: 'This room does not exist. Scan the QR code again.' }, 404);
    const peer = await this.peer(request);
    if (!peer) return json({ error: 'This co-chair link is not valid. Ask a co-chair for the current link.' }, 403);
    return json(this.snapshot(peer, this.participants()));
  }

  async onConnect(connection: Connection<Peer>, context: ConnectionContext): Promise<void> {
    const peer = await this.peer(context.request);
    if (!peer) { connection.close(1008, 'Room access denied'); return; }
    connection.setState(peer);
    this.presence(connection);
  }

  async onMessage(connection: Connection<Peer>, message: WSMessage): Promise<void> {
    const fail = (text: string): void => connection.send(JSON.stringify({ type: 'error', message: text }));
    if (!this.room || !connection.state || typeof message !== 'string' || message.length > 1024) { fail('Invalid request. Refresh and try again.'); return; }
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(message);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      payload = parsed as Record<string, unknown>;
    } catch { fail('Invalid request. Refresh and try again.'); return; }
    const action = parseAction(payload.action);
    if (payload.type !== 'action' || !action) { fail('Invalid action. Refresh and try again.'); return; }
    const peer = connection.state;
    const vote = action.type === 'vote';
    if ((vote && peer.role !== 'audience') || (!vote && peer.role !== 'admin')) { fail('Only a co-chair can control the talk.'); return; }
    if (payload.roundId !== this.room.roundId || (!vote && action.type !== 'speaker' && payload.version !== this.room.version)) {
      fail('The talk changed. Check the screen and try again.');
      this.send([connection]);
      return;
    }
    const current = this.current();
    if (action.type === 'vote') {
      if (!ballotOpen(current)) { fail('Voting is closed.'); return; }
      const first = this.room.votes[peer.participant!] === undefined;
      this.room.votes[peer.participant!] = action.opinion;
      await this.ctx.storage.put('room', this.room);
      this.send([connection, ...this.peers('admin')]);
      if (first) this.react(action.opinion);
      return;
    }
    if (action.type === 'speaker') {
      this.room.speaker = action.name;
      this.room.version += 1;
      await this.ctx.storage.put('room', this.room);
      this.send(this.getConnections<Peer>());
      return;
    }
    const next = transition(current, action);
    if (next === current) { fail('That control is not available now.'); return; }
    this.room.session = next;
    this.room.clockAt = Date.now();
    if (action.type === 'start' || action.type === 'reset') {
      this.room.roundId = crypto.randomUUID();
      this.room.votes = {};
    }
    if (action.type === 'reset') this.room.speaker = '';
    if (action.type === 'start' && action.speaker !== undefined) this.room.speaker = action.speaker;
    this.room.version += 1;
    await this.ctx.storage.put('room', this.room);
    await this.schedule();
    this.send(this.getConnections<Peer>());
  }

  onClose(): void { if (this.room) this.presence(); }

  async onAlarm(): Promise<void> {
    if (!this.room) return;
    this.room.session = this.current();
    this.room.clockAt = Date.now();
    this.room.version += 1;
    await this.ctx.storage.put('room', this.room);
    await this.schedule();
    this.send(this.getConnections<Peer>());
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!sameOrigin(request)) return json({ error: 'Open this page directly to create a room.' }, 403);
      if (!env.ADMIN_PASSPHRASE?.trim()) {
        console.warn('Room creation denied: ADMIN_PASSPHRASE is not set');
        return json({ error: 'Room creation is not set up. Ask the organizer to set the event passphrase.' }, 503);
      }
      if (!await passphraseMatches(request, env.ADMIN_PASSPHRASE)) {
        console.warn('Room creation denied: wrong passphrase');
        return json({ error: 'That passphrase is not correct. Check it and try again.' }, 403);
      }
      const room = crypto.randomUUID().replaceAll('-', '');
      const key = token();
      const response = await env.ROOM.getByName(room).fetch(new Request('http://room/initialize', { method: 'POST', body: JSON.stringify({ hostHash: await hash(key) }) }));
      if (response.status !== 201) return response;
      return json({ room, key }, 201);
    }
    const bootstrap = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{32})\/session$/);
    if (bootstrap && request.method === 'GET') {
      if (!roleOf(request)) return json({ error: 'Unknown screen.' }, 400);
      const headers = new Headers(request.headers);
      let identity = cookie(request, 'cc_participant');
      const issueIdentity = roleOf(request) === 'audience' && !tokenPattern.test(identity);
      if (issueIdentity) {
        identity = token();
        const otherCookies = (headers.get('Cookie') || '').split(';').filter(part => !part.trim().startsWith('cc_participant='));
        headers.set('Cookie', [...otherCookies, `cc_participant=${identity}`].join('; '));
      }
      const response = await env.ROOM.getByName(bootstrap[1]).fetch(new Request(`http://room/session${url.search}`, { headers }));
      const result = new Response(response.body, response);
      if (response.ok && issueIdentity) result.headers.append('Set-Cookie', setCookie('cc_participant', identity, request));
      return result;
    }
    const socket = url.pathname.match(/^\/parties\/room\/([^/]+)$/);
    if (socket) {
      if (!roomPattern.test(socket[1]) || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Not found.' }, 404);
      if (!sameOrigin(request)) return json({ error: 'Connection origin denied.' }, 403);
      return (await routePartykitRequest(request, env)) || json({ error: 'Room not found.' }, 404);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/parties/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
