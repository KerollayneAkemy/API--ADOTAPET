import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { AnimalsModule } from '../animals/animals.module';
import { ApplicationsController } from './controllers/applications.controller';
import { ApplicationsService } from './services/applications.service';

@Module({
  imports: [AuthModule, AnimalsModule, PersistenceModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
