import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { RouteParamsFactory } from '@nestjs/core/router/route-params-factory';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthController } from '../src/modules/auth/controllers/auth.controller';
import { AuthService } from '../src/modules/auth/services/auth.service';

describe('Swagger de Idempotency-Key', () => {
  let app: INestApplication;
  let registerMock: jest.Mock;

  beforeAll(async () => {
    registerMock = jest.fn(async (_body: unknown, idempotencyKey?: string) => ({
      idempotencyKey,
    }));
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { register: registerMock, login: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app?.close());

  it('documenta um único cabeçalho obrigatório com o nome e tamanho corretos', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('AdotaPet teste').setVersion('1.0').build(),
    );
    const parameters = document.paths['/api/auth/register']?.post?.parameters ?? [];
    const headers = parameters.filter(
      (parameter) =>
        'in' in parameter &&
        parameter.in === 'header' &&
        'name' in parameter &&
        parameter.name.toLowerCase() === 'idempotency-key',
    );

    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatchObject({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 128 },
    });
  });

  it('extrai o header HTTP e o encaminha ao serviço de cadastro', async () => {
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      AuthController,
      'register',
    ) as Record<string, { data?: unknown }>;
    const headerArgument = Object.values(routeArguments).find(
      (argument) => argument.data === 'Idempotency-Key',
    );
    expect(headerArgument).toBeDefined();

    const idempotencyKey = new RouteParamsFactory().exchangeKeyForValue(
      RouteParamtypes.HEADERS,
      headerArgument?.data as string,
      {
        req: { headers: { 'idempotency-key': 'register-test-1234' } },
        res: {},
        next: () => undefined,
      },
    );
    const body = {
      name: 'Teste',
      email: 'teste@example.test',
      password: 'senha-segura-123',
      role: 'ADOTANTE' as const,
    };

    await app.get(AuthController).register(body, idempotencyKey as string);
    expect(registerMock).toHaveBeenCalledWith(body, 'register-test-1234');
  });
});
