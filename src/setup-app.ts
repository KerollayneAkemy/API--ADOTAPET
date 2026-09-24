import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupApp(app: INestApplication): void {
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
      'API local para adoção de animais. Usuários, animais e solicitações são salvos em arquivo local e recuperados após reiniciar. Sessões ficam em memória: faça novo login após reiniciar. Faça login e cole o accessToken real em Authorize. Tokens e UUIDs dos exemplos são ilustrativos. Erros seguem o formato padrão do NestJS.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'Opaque',
      description: 'Token opaco do login, não JWT. Cole somente o accessToken.',
    })
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
