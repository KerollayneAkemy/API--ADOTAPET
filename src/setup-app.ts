import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { HttpExceptionFilter } from './common/observability/http-exception.filter';
import { logJson } from './common/observability/json-logger';
import { runWithRequestId } from './common/observability/request-context';

type RequestWithId = Request & { requestId: string };

export function setupApp(app: INestApplication): void {
  // O proxy do Coolify é a primeira camada confiável antes do cliente HTTP.
  const express = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: unknown) => void;
  };
  express.set('trust proxy', 1);

  app.use((request: Request, response: Response, next: (error?: unknown) => void) => {
    const supplied = request.header('x-request-id');
    const requestId = supplied && /^[\w.-]{1,128}$/.test(supplied) ? supplied : randomUUID();
    (request as RequestWithId).requestId = requestId;
    response.setHeader('X-Request-ID', requestId);
    const startedAt = Date.now();
    runWithRequestId(requestId, () => {
      response.on('finish', () =>
        runWithRequestId(requestId, () =>
          logJson('info', 'http.request', {
            method: request.method,
            path: request.path,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        ),
      );
      next();
    });
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('AdotaPet API')
    .setDescription(
      'API de adoção com PostgreSQL, JWT, Redis e imagens armazenadas em bucket privado no Cloudflare R2. Cadastro, criação de animal, solicitação e upload de foto exigem Idempotency-Key. Faça login e cole o accessToken em Authorize. Erros seguem RFC 7807 e incluem requestId.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT de acesso válido por 24 horas. Cole somente o accessToken.',
    })
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
