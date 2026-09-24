import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { AnimalsModule } from './modules/animals/animals.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { HealthModule } from './modules/health/health.module';

@Module({ imports: [AuthModule, AnimalsModule, ApplicationsModule, HealthModule] })
export class AppModule {}
