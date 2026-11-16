import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { RedisRateLimitService } from './redis-rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RedisRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    await this.rateLimit.check(`http:${request.ip || request.socket.remoteAddress || 'unknown'}`);
    return true;
  }
}
