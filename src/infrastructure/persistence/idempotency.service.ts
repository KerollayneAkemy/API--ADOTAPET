import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';

export interface IdempotentResult<T> {
  statusCode: number;
  body: T;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly database: DatabaseService) {}

  async execute<T>(
    scopeKey: string,
    idempotencyKey: string | undefined,
    request: unknown,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    if (!idempotencyKey || !/^[\w.-]{8,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('Envie um Idempotency-Key válido com 8 a 128 caracteres.');
    }
    const requestHash = createHash('sha256').update(canonical(request)).digest('hex');
    return this.database.transaction(async (client) => {
      // A trava transacional impede duas instâncias de executar o mesmo par escopo/chave.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${scopeKey}:${idempotencyKey}`,
      ]);
      await client.query(
        "DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'",
      );
      const existing = await client.query<{
        request_hash: string;
        response_status: number;
        response: T;
      }>(
        'SELECT request_hash,response_status,response FROM idempotency_keys WHERE scope_key=$1 AND idempotency_key=$2',
        [scopeKey, idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== requestHash) {
          throw new ConflictException('Idempotency-Key já foi usada com outra requisição.');
        }
        return {
          statusCode: existing.rows[0].response_status,
          body: existing.rows[0].response,
        };
      }

      const body = await operation(client);
      const statusCode = 201;
      await client.query(
        'INSERT INTO idempotency_keys(scope_key,idempotency_key,request_hash,response_status,response) VALUES($1,$2,$3,$4,$5)',
        [scopeKey, idempotencyKey, requestHash, statusCode, JSON.stringify(body)],
      );
      return { statusCode, body };
    });
  }
}
