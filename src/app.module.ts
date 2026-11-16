import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { AnimalsModule } from './modules/animals/animals.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { HealthModule } from './modules/health/health.module';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module';
import { RateLimitGuard } from './infrastructure/rate-limit/rate-limit.guard';

@Module({
  imports: [AuthModule, AnimalsModule, ApplicationsModule, HealthModule, RateLimitModule],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
