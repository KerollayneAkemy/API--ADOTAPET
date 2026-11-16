import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AccessTokenClaims {
  sub: string;
  role: 'ADMIN' | 'ONG' | 'ADOTANTE';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const issuer = process.env.JWT_ISSUER ?? 'adotapet-api';
const audience = process.env.JWT_AUDIENCE ?? 'adotapet-client';

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || Buffer.byteLength(value) < 32)
    throw new Error('JWT_SECRET deve ter ao menos 32 bytes.');
  return value;
}

export function signAccessToken(userId: string, role: AccessTokenClaims['role']): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: userId,
    role,
    iat: now,
    exp: now + 86400,
    iss: issuer,
    aud: audience,
  });
  const input = header + '.' + payload;
  const signature = createHmac('sha256', secret()).update(input).digest('base64url');
  return input + '.' + signature;
}

export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature || token.split('.').length !== 3) return null;
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as {
      alg?: string;
    };
    if (header.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret())
      .update(headerPart + '.' + payloadPart)
      .digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8'),
    ) as AccessTokenClaims;
    if (
      claims.exp <= Math.floor(Date.now() / 1000) ||
      claims.iss !== issuer ||
      claims.aud !== audience
    )
      return null;
    if (!['ADMIN', 'ONG', 'ADOTANTE'].includes(claims.role) || typeof claims.sub !== 'string')
      return null;
    return claims;
  } catch {
    return null;
  }
}
