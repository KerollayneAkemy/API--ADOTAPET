import { Global, Module } from '@nestjs/common';
import { RedisRateLimitService } from './redis-rate-limit.service';

@Global()
@Module({ providers: [RedisRateLimitService], exports: [RedisRateLimitService] })
export class RateLimitModule {}
