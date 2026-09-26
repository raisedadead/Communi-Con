export const tokenPattern = /^[a-f0-9]{64}$/;

export function token(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

export async function hash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await digest(value)), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function passphraseMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected.trim())]);
  return given !== '' && crypto.subtle.timingSafeEqual(a, b);
}
