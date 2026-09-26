import { routePartykitRequest } from 'partyserver';
import { cleanName } from './actions';
import { hash, passphraseMatches, token, tokenPattern } from './auth';
import { cookie, json, roleOf, sameOrigin, setCookie } from './http';
import type { Env } from './room';

export { Room } from './room';

const roomPattern = /^\d{8}$/;

function roomCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value < 4_200_000_000 ? String(value % 100_000_000).padStart(8, '0') : roomCode();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function creation(request: Request): Promise<{ passphrase: string; event: string }> {
  const body: unknown = await request.json().catch(() => null);
  const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return { passphrase: text(fields.passphrase).trim(), event: cleanName(text(fields.event)) };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!sameOrigin(request))
        return json({ error: 'Open /admin on this site to create a room.' }, 403);
      if (!env.ADMIN_PASSPHRASE?.trim()) {
        console.warn('Room creation denied: ADMIN_PASSPHRASE is not set');
        return json(
          { error: 'Room creation is not set up. Ask the organizer to set the event passphrase.' },
          503,
        );
      }
      const { passphrase, event } = await creation(request);
      if (!(await passphraseMatches(passphrase, env.ADMIN_PASSPHRASE))) {
        console.warn('Room creation denied: wrong passphrase');
        return json({ error: 'That passphrase is not correct.' }, 403);
      }
      const key = token();
      const body = JSON.stringify({ hostHash: await hash(key), event });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const room = roomCode();
        const response = await env.ROOM.getByName(room).fetch(
          new Request('http://room/initialize', { method: 'POST', body }),
        );
        if (response.status === 201) return json({ room, key }, 201);
        if (response.status !== 409) return response;
      }
      return json({ error: 'Unable to create a room. Try again.' }, 503);
    }
    const bootstrap = url.pathname.match(/^\/api\/rooms\/(\d{8})\/session$/);
    if (bootstrap && request.method === 'GET') {
      if (!roleOf(request)) return json({ error: 'Unknown screen.' }, 400);
      const headers = new Headers(request.headers);
      let identity = cookie(request, 'cc_participant');
      const issueIdentity = roleOf(request) === 'audience' && !tokenPattern.test(identity);
      if (issueIdentity) {
        identity = token();
        const otherCookies = (headers.get('Cookie') || '')
          .split(';')
          .filter(part => !part.trim().startsWith('cc_participant='));
        headers.set('Cookie', [...otherCookies, `cc_participant=${identity}`].join('; '));
      }
      const response = await env.ROOM.getByName(bootstrap[1]).fetch(
        new Request(`http://room/session${url.search}`, { headers }),
      );
      const result = new Response(response.body, response);
      if (response.ok && issueIdentity)
        result.headers.append('Set-Cookie', setCookie('cc_participant', identity, request));
      return result;
    }
    const socket = url.pathname.match(/^\/parties\/room\/([^/]+)$/);
    if (socket) {
      if (
        !roomPattern.test(socket[1]) ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
      )
        return json({ error: 'Not found.' }, 404);
      if (!sameOrigin(request)) return json({ error: 'Connection origin denied.' }, 403);
      return (
        (await routePartykitRequest(request, env)) ||
        json({ error: 'No event has this code.' }, 404)
      );
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/parties/'))
      return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
