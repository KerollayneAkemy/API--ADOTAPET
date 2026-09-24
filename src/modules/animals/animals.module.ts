import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { AnimalsController } from './controllers/animals.controller';
import { AnimalsService } from './services/animals.service';

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [AnimalsController],
  providers: [AnimalsService],
  exports: [AnimalsService],
})
export class AnimalsModule {}
