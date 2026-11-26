import { parseTtlSeconds, randomToken, sha256Hex } from './crypto.util';

describe('crypto util', () => {
  it('genera tokens opacos de alta entropía y únicos', () => {
    const a = randomToken(32);
    const b = randomToken(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('hashea tokens con SHA-256 de forma determinista', () => {
    expect(sha256Hex('token')).toBe(sha256Hex('token'));
    expect(sha256Hex('token')).not.toBe(sha256Hex('otro'));
    expect(sha256Hex('token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('convierte TTL con sufijo a segundos', () => {
    expect(parseTtlSeconds('15m')).toBe(900);
    expect(parseTtlSeconds('24h')).toBe(86400);
    expect(parseTtlSeconds('30d')).toBe(2592000);
    expect(() => parseTtlSeconds('mal')).toThrow();
  });
});
