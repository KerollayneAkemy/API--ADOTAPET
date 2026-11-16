import { Module } from '@nestjs/common';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module';
import { AuthModule } from '../auth/auth.module';
import { AnimalsController } from './controllers/animals.controller';
import { AnimalsService } from './services/animals.service';
import { R2StorageService } from '../../infrastructure/storage/r2-storage.service';

// Centraliza as dependências e rotas relacionadas aos animais.
@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [AnimalsController],
  providers: [AnimalsService, R2StorageService],
  exports: [AnimalsService],
})
export class AnimalsModule {}
