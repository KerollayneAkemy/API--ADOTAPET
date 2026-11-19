import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  // O salt aleatório evita hashes iguais para senhas iguais; scrypt dificulta tentativas em massa.
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}

export function matchesPassword(password: string, hash: string): boolean {
  const [salt, digest] = hash.split(':');
  // A comparação em tempo constante reduz vazamentos sobre quantos bytes do hash coincidem.
  return timingSafeEqual(Buffer.from(digest, 'hex'), scryptSync(password, salt, 64));
}
