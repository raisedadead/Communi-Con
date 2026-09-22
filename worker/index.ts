import { routePartykitRequest, Server } from 'partyserver';
import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import { initialSession, phaseOf, transition } from '../src/session';
import type { Action, Opinion, Session } from '../src/session';
import type { Member, Results, Role, RoomSnapshot } from '../src/protocol';

interface Env {
  ROOM: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  PUBLIC_ORIGIN?: string;
}

interface RoomRecord {
  hostHash: string;
  session: Session;
  clockAt: number;
  roundId: string;
  version: number;
  votes: Record<string, Opinion>;
  joined: Record<string, boolean>;
  origin: string;
}

interface Peer {
  role: Role;
  participant: string | null;
}

const roomPattern = /^[a-f0-9]{32}$/;
const tokenPattern = /^[a-f0-9]{64}$/;

function token(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookie(request: Request, name: string): string {
  return request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

function setCookie(name: string, value: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' || request.headers.get('X-Forwarded-Proto') === 'https';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? '; Secure' : ''}`;
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function roleOf(request: Request): Role | null {
  const role = new URL(request.url).searchParams.get('role');
  return role === 'audience' || role === 'stage' || role === 'admin' ? role : null;
}

function allowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin || Boolean(env.PUBLIC_ORIGIN && origin === env.PUBLIC_ORIGIN);
}

function parseAction(value: unknown): Action | null {
  if (!value || typeof value !== 'object') return null;
  const action = value as Record<string, unknown>;
  if (action.type === 'start' || action.type === 'reset' || action.type === 'pause' || action.type === 'applause' || action.type === 'join') return { type: action.type };
  if (action.type === 'seek' && typeof action.seconds === 'number' && [0, 300, 480, 600].includes(action.seconds)) return { type: 'seek', seconds: action.seconds };
  if (action.type === 'vote' && (action.opinion === 'keep' || action.opinion === 'wrap')) return { type: 'vote', opinion: action.opinion };
  return null;
}

export class Room extends Server<Env> {
  static options = { hibernate: true };
  private room: RoomRecord | undefined;

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
      const credential = cookie(request, `cc_host_${this.name}`);
      return tokenPattern.test(credential) && await hash(credential) === this.room.hostHash ? { role, participant: null } : null;
    }
    if (role === 'stage') return { role, participant: null };
    const identity = cookie(request, 'cc_participant');
    return tokenPattern.test(identity) ? { role, participant: await hash(identity) } : null;
  }

  private members(): Member[] {
    const members = new Map<string, Member>();
    for (const connection of this.getConnections<Peer>()) {
      const peer = connection.state;
      if (peer?.role === 'audience' && peer.participant && connection.readyState === 1) {
        members.set(peer.participant, { id: peer.participant, joined: Boolean(this.room!.joined[peer.participant]) });
      }
    }
    return [...members.values()];
  }

  private snapshot(peer: Peer): RoomSnapshot {
    const record = this.room!;
    const members = this.members();
    const snapshot: RoomSnapshot = {
      type: 'state', room: this.name, roundId: record.roundId, version: record.version,
      session: { ...this.current(), opinion: peer.participant ? record.votes[peer.participant] || null : null, joined: Boolean(peer.participant && record.joined[peer.participant]) },
      participantId: peer.participant, participants: members.length, members,
      joinUrl: `${record.origin}/?room=${this.name}`,
    };
    if (peer.role === 'admin') {
      const votes = Object.values(record.votes);
      const results: Results = { keep: votes.filter(vote => vote === 'keep').length, wrap: votes.filter(vote => vote === 'wrap').length, total: votes.length };
      snapshot.results = results;
    }
    return snapshot;
  }

  private publish(): void {
    for (const connection of this.getConnections<Peer>()) {
      if (connection.state && connection.readyState === 1) connection.send(JSON.stringify(this.snapshot(connection.state)));
    }
  }

  private async schedule(): Promise<void> {
    const session = this.current();
    const boundary = [300, 480, 600].find(seconds => seconds > session.elapsed);
    if (session.mode === 'talk' && !session.paused && !session.applause && boundary) {
      await this.ctx.storage.setAlarm(Date.now() + (boundary - session.elapsed) * 1000);
    } else await this.ctx.storage.deleteAlarm();
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/initialize' && request.method === 'POST') {
      if (this.room) return json({ error: 'Room already exists.' }, 409);
      const { hostHash, origin } = await request.json<{ hostHash: string; origin: string }>();
      this.room = { hostHash, origin, session: initialSession(), clockAt: Date.now(), roundId: crypto.randomUUID(), version: 0, votes: {}, joined: {} };
      await this.ctx.storage.put('room', this.room);
      return json({ room: this.name }, 201);
    }
    if (!this.room) return json({ error: 'This room does not exist. Scan the current stage QR code.' }, 404);
    const peer = await this.peer(request);
    if (!peer) return json({ error: 'Open the co-chair page in the browser that created this room.' }, 403);
    return json(this.snapshot(peer));
  }

  async onConnect(connection: Connection<Peer>, context: ConnectionContext): Promise<void> {
    const peer = await this.peer(context.request);
    if (!peer) { connection.close(1008, 'Room access denied'); return; }
    connection.setState(peer);
    this.publish();
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
    const participantAction = action.type === 'vote' || action.type === 'join';
    if ((!participantAction && peer.role !== 'admin') || (participantAction && peer.role !== 'audience')) { fail('Only the co-chair can control the session.'); return; }
    if (payload.roundId !== this.room.roundId || (!participantAction && payload.version !== this.room.version)) {
      fail('The session changed. Please try again.');
      connection.send(JSON.stringify(this.snapshot(peer)));
      return;
    }
    const current = this.current();
    if (action.type === 'vote') {
      if (current.paused || !['voting', 'eligible'].includes(phaseOf(current))) { fail('The ballot is closed. Wait for the co-chair.'); return; }
      this.room.votes[peer.participant!] = action.opinion;
    } else if (action.type === 'join') {
      if (current.mode !== 'practice') { fail('Practice has ended. The talk is starting.'); return; }
      this.room.joined[peer.participant!] = true;
    } else {
      const next = transition(current, action);
      if (next === current) { fail('That control is unavailable in this phase.'); return; }
      this.room.session = next;
      this.room.clockAt = Date.now();
      if (action.type === 'start' || action.type === 'reset' || (action.type === 'seek' && action.seconds < 300)) {
        this.room.roundId = crypto.randomUUID();
        this.room.votes = {};
        this.room.joined = {};
      }
    }
    if (!participantAction) this.room.version += 1;
    await this.ctx.storage.put('room', this.room);
    await this.schedule();
    this.publish();
  }

  onClose(): void { if (this.room) this.publish(); }

  async onAlarm(): Promise<void> {
    if (!this.room) return;
    this.room.session = this.current();
    this.room.clockAt = Date.now();
    this.room.version += 1;
    await this.ctx.storage.put('room', this.room);
    await this.schedule();
    this.publish();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!allowedOrigin(request, env)) return json({ error: 'Open this page directly to create a room.' }, 403);
      const room = crypto.randomUUID().replaceAll('-', '');
      const credential = token();
      const origin = env.PUBLIC_ORIGIN || url.origin;
      const response = await env.ROOM.getByName(room).fetch(new Request('http://room/initialize', { method: 'POST', body: JSON.stringify({ hostHash: await hash(credential), origin }) }));
      if (response.status !== 201) return response;
      return json({ room }, 201, { 'Set-Cookie': setCookie(`cc_host_${room}`, credential, request) });
    }
    const bootstrap = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{32})\/session$/);
    if (bootstrap && request.method === 'GET') {
      const role = roleOf(request);
      if (!role) return json({ error: 'Unknown screen.' }, 400);
      const headers = new Headers(request.headers);
      let identity = cookie(request, 'cc_participant');
      const issueIdentity = role === 'audience' && !tokenPattern.test(identity);
      if (issueIdentity) {
        identity = token();
        const otherCookies = (headers.get('Cookie') || '').split(';').filter(part => !part.trim().startsWith('cc_participant='));
        headers.set('Cookie', [...otherCookies, `cc_participant=${identity}`].join('; '));
      }
      const response = await env.ROOM.getByName(bootstrap[1]).fetch(new Request(`http://room/session?role=${role}`, { headers }));
      const result = new Response(response.body, response);
      if (response.ok && issueIdentity) result.headers.append('Set-Cookie', setCookie('cc_participant', identity, request));
      return result;
    }
    const socket = url.pathname.match(/^\/parties\/room\/([^/]+)$/);
    if (socket) {
      if (!roomPattern.test(socket[1]) || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Not found.' }, 404);
      if (!allowedOrigin(request, env)) return json({ error: 'Connection origin denied.' }, 403);
      return (await routePartykitRequest(request, env)) || json({ error: 'Room not found.' }, 404);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/parties/') || url.pathname.startsWith('/cdn-cgi/local/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
