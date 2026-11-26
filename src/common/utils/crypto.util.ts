import { createHash, randomBytes } from 'crypto';

/** Token opaco de alta entropía (URL-safe). Se entrega al cliente en claro. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash SHA-256 del token: es lo único que se persiste en la base de datos. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Convierte un TTL con sufijo s/m/h/d (p. ej. "15m") a segundos. */
export function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) {
    throw new Error(`TTL inválido: "${ttl}". Usa un número seguido de s, m, h o d.`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * multipliers[unit];
}
