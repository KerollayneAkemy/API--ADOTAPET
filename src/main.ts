import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';
import { logJson } from './common/observability/json-logger';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um número inteiro entre 1 e 65535');
  }

  const app = await NestFactory.create(AppModule, { logger: false });
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(port);

  logJson('info', 'bootstrap.ready', {
    port,
    healthPath: '/api/health',
    swaggerPath: '/docs',
  });
}

bootstrap().catch((error: unknown) => {
  logJson('error', 'bootstrap.failed', {
    errorType: error instanceof Error ? error.name : typeof error,
  });
  process.exitCode = 1;
});
