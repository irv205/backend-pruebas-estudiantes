import { Request } from 'express';

export interface CookieAttributes {
  httpOnly: boolean;
  sameSite: 'lax' | 'strict';
  secure: boolean;
  path: string;
  maxAge?: number;
}

/** Serializador minimalista: los valores generados son base64url seguros. */
export function serializeCookie(name: string, value: string, attrs: CookieAttributes): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${attrs.path}`,
    `SameSite=${attrs.sameSite === 'lax' ? 'Lax' : 'Strict'}`,
  ];
  if (attrs.httpOnly) parts.push('HttpOnly');
  if (attrs.secure) parts.push('Secure');
  if (attrs.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(attrs.maxAge)}`);
  return parts.join('; ');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(raw);
    } catch {
      result[key] = raw;
    }
  }
  return result;
}

export function cookieValue(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}
