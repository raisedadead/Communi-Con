import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAdminKey } from './route';

describe('readAdminKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not store a shared key before the room accepts it', () => {
    const key = 'a'.repeat(64);
    const storage = new Map<string, string>();
    vi.stubGlobal('location', {
      hash: `#key=${key}`,
      pathname: '/admin',
      search: '?room=12345678',
    });
    vi.stubGlobal('history', { replaceState: () => {} });
    vi.stubGlobal('localStorage', {
      getItem: (name: string) => storage.get(name) ?? null,
      setItem: (name: string, value: string) => storage.set(name, value),
    });
    expect(readAdminKey('12345678')).toBe(key);
    expect(storage.size).toBe(0);
  });
});
