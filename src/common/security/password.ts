import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

export function matchesPassword(password: string, hash: string): boolean {
  const [salt, digest] = hash.split(':');
  return timingSafeEqual(Buffer.from(digest, 'hex'), scryptSync(password, salt, 64));
}
