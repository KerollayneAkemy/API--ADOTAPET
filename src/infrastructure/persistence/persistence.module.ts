import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { IdempotencyService } from './idempotency.service';

@Module({
  providers: [DatabaseService, IdempotencyService],
  exports: [DatabaseService, IdempotencyService],
})
export class PersistenceModule {}
