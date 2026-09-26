import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import { Server } from 'partyserver';
import type { Reactions, Results, Role, RoomSnapshot } from '../shared/protocol';
import type { Opinion, Session } from '../shared/session';
import { ballotOpen, initialSession, transition, votingWindow } from '../shared/session';
import { parseAction } from './actions';
import { hash, tokenPattern } from './auth';
import { cookie, json, roleOf } from './http';

export interface Env {
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

const reactionLimit = 12;

export class Room extends Server<Env> {
  static options = { hibernate: true };
  private room: RoomRecord | undefined;
  private presenceTimer: ReturnType<typeof setTimeout> | undefined;
  private reactionTimer: ReturnType<typeof setTimeout> | undefined;
  private reactions: Record<Opinion, number> = { keep: 0, wrap: 0 };

  async onStart(): Promise<void> {
    this.room = await this.ctx.storage.get<RoomRecord>('room');
    if (this.room)
      this.room.session = {
        ...initialSession(),
        ...this.room.session,
        planned: this.room.session.planned ?? this.room.session.length,
      };
  }

  private current(): Session {
    const record = this.room!;
    return transition(record.session, {
      type: 'tick',
      seconds: Math.max(0, (Date.now() - record.clockAt) / 1000),
    });
  }

  private async peer(request: Request): Promise<Peer | null> {
    const role = roleOf(request);
    if (!role || !this.room) return null;
    if (role === 'admin') {
      const key = new URL(request.url).searchParams.get('key') || '';
      return tokenPattern.test(key) && (await hash(key)) === this.room.hostHash
        ? { role, participant: null }
        : null;
    }
    if (role === 'stage') return { role, participant: null };
    const identity = cookie(request, 'cc_participant');
    return tokenPattern.test(identity) ? { role, participant: await hash(identity) } : null;
  }

  private peers(role: Role): Connection<Peer>[] {
    return [...this.getConnections<Peer>(role)].filter(
      connection => connection.state?.role === role,
    );
  }

  private participants(): number {
    return new Set(this.peers('audience').map(connection => connection.state!.participant)).size;
  }

  private snapshot(peer: Peer, participants: number): RoomSnapshot {
    const record = this.room!;
    const snapshot: RoomSnapshot = {
      type: 'state',
      roundId: record.roundId,
      version: record.version,
      session: this.current(),
      opinion: peer.participant ? record.votes[peer.participant] || null : null,
      participants,
      speaker: record.speaker || '',
    };
    if (peer.role === 'admin') {
      const votes = Object.values(record.votes);
      const results: Results = {
        keep: votes.filter(vote => vote === 'keep').length,
        wrap: votes.filter(vote => vote === 'wrap').length,
        total: votes.length,
      };
      snapshot.results = results;
    }
    return snapshot;
  }

  private send(connections: Iterable<Connection<Peer>>): void {
    const participants = this.participants();
    for (const connection of new Set(connections)) {
      if (connection.state && connection.readyState === WebSocket.READY_STATE_OPEN)
        connection.send(JSON.stringify(this.snapshot(connection.state, participants)));
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
        if (connection.readyState === WebSocket.READY_STATE_OPEN)
          connection.send(JSON.stringify(message));
      }
    }, 1000);
  }

  private async schedule(): Promise<void> {
    const session = this.current();
    const { from, to } = votingWindow(session);
    const boundary = Math.min(
      ...[from, to, session.length].filter(seconds => seconds > session.elapsed),
    );
    if (
      session.mode === 'talk' &&
      !session.paused &&
      !session.applause &&
      Number.isFinite(boundary)
    ) {
      await this.ctx.storage.setAlarm(Date.now() + (boundary - session.elapsed) * 1000);
    } else await this.ctx.storage.deleteAlarm();
  }

  getConnectionTags(_connection: Connection, context: ConnectionContext): string[] {
    return [roleOf(context.request) || 'unknown'];
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/initialize' && request.method === 'POST') {
      const { hostHash } = await request.json<{ hostHash: string }>();
      if (this.room) return json({ error: 'Room already exists.' }, 409);
      this.room = {
        hostHash,
        session: initialSession(),
        clockAt: Date.now(),
        roundId: crypto.randomUUID(),
        version: 0,
        votes: {},
      };
      await this.ctx.storage.put('room', this.room);
      return json({ room: this.name }, 201);
    }
    if (!this.room) return json({ error: 'No event has this code.' }, 404);
    const peer = await this.peer(request);
    if (!peer)
      return json(
        { error: 'This co-chair link is not valid. Ask a co-chair for the current link.' },
        403,
      );
    return json(this.snapshot(peer, this.participants()));
  }

  async onConnect(connection: Connection<Peer>, context: ConnectionContext): Promise<void> {
    const peer = await this.peer(context.request);
    if (!peer) {
      connection.close(1008, 'Room access denied');
      return;
    }
    connection.setState(peer);
    this.presence(connection);
  }

  async onMessage(connection: Connection<Peer>, message: WSMessage): Promise<void> {
    const fail = (text: string): void =>
      connection.send(JSON.stringify({ type: 'error', message: text }));
    if (!this.room || !connection.state || typeof message !== 'string' || message.length > 1024) {
      fail('Unable to send that. Reload the page.');
      return;
    }
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(message);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      payload = parsed as Record<string, unknown>;
    } catch {
      fail('Unable to send that. Reload the page.');
      return;
    }
    const action = parseAction(payload.action);
    if (payload.type !== 'action' || !action) {
      fail('Unable to send that. Reload the page.');
      return;
    }
    const peer = connection.state;
    const vote = action.type === 'vote';
    if ((vote && peer.role !== 'audience') || (!vote && peer.role !== 'admin')) {
      fail('Only a co-chair can run the talk.');
      return;
    }
    if (
      payload.roundId !== this.room.roundId ||
      (!vote && action.type !== 'speaker' && payload.version !== this.room.version)
    ) {
      fail('The talk changed. Try again.');
      this.send([connection]);
      return;
    }
    const current = this.current();
    if (action.type === 'vote') {
      if (!ballotOpen(current)) {
        fail('Voting is closed.');
        return;
      }
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
    if (next === current) {
      fail('That control is not available now.');
      return;
    }
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

  onClose(): void {
    if (this.room) this.presence();
  }

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
