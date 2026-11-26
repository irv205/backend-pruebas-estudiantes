import { parseCookies, serializeCookie } from './cookies.util';

describe('cookies util', () => {
  it('serializa cookies HttpOnly con SameSite, Path y Max-Age', () => {
    const value = serializeCookie('refresh_token', 'abc-123', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/api/v1',
      maxAge: 60,
    });
    expect(value).toContain('refresh_token=abc-123');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Lax');
    expect(value).toContain('Secure');
    expect(value).toContain('Path=/api/v1');
    expect(value).toContain('Max-Age=60');
  });

  it('parsea varias cookies y tolera valores codificados', () => {
    expect(parseCookies('a=1; b=hola%20mundo; c=')).toEqual({ a: '1', b: 'hola mundo', c: '' });
    expect(parseCookies(undefined)).toEqual({});
  });
});
