import type { Role } from '../shared/protocol';

export function cookie(request: Request, name: string): string {
  return (
    request.headers
      .get('Cookie')
      ?.split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ''
  );
}

export function setCookie(name: string, value: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? '; Secure' : ''}`;
}

export function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function roleOf(request: Request): Role | null {
  const role = new URL(request.url).searchParams.get('role');
  return role === 'audience' || role === 'stage' || role === 'admin' ? role : null;
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get('Origin') === new URL(request.url).origin;
}
