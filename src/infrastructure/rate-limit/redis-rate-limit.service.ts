import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisRateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly redis?: Redis;
  private readonly local = new Map<string, { count: number; expiresAt: number }>();
  private readonly limit = Number(process.env.RATE_LIMIT_MAX ?? 100);
  private readonly windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);

  constructor() {
    if (
      !Number.isInteger(this.limit) ||
      this.limit < 1 ||
      !Number.isInteger(this.windowMs) ||
      this.windowMs < 1
    ) {
      throw new Error('RATE_LIMIT_MAX e RATE_LIMIT_WINDOW_MS devem ser inteiros positivos.');
    }
    if (process.env.NODE_ENV !== 'test' || process.env.REDIS_URL) {
      if (!process.env.REDIS_URL) throw new Error('REDIS_URL é obrigatório fora dos testes.');
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.redis) await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  async check(key: string): Promise<void> {
    if (this.redis) {
      let count: number;
      try {
        count = (await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n",
          1,
          key,
          this.windowMs,
        )) as number;
      } catch {
        // Falha fechada: sem Redis, a API não ignora o limite entre instâncias.
        throw new ServiceUnavailableException('Controle de requisições indisponível.');
      }
      if (count > this.limit)
        throw new HttpException('Limite de requisições excedido.', HttpStatus.TOO_MANY_REQUESTS);
      return;
    }
    const now = Date.now();
    let entry = this.local.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + this.windowMs };
      this.local.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.limit)
      throw new HttpException('Limite de requisições excedido.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
