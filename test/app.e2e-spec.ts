import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Animal, Application, PublicUser } from '../src/domain/entities';
import { setupApp } from '../src/setup-app';
import { StoreService } from '../src/infrastructure/persistence/store.service';

type LoginResponse = { accessToken: string; user: PublicUser };

describe('AdotaPet HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  let store: StoreService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StoreService)
      .useFactory({ factory: () => new StoreService(':memory:') })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    store = app.get(StoreService);
  });

  afterEach(async () => {
    await app?.close();
  });

  async function request<T = unknown>(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
  ) {
    const response = await fetch(baseUrl + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as T };
  }

  async function login(prefix: string): Promise<LoginResponse> {
    const result = await request<LoginResponse>('/auth/login', 'POST', {
      email: prefix + '@adotapet.local',
      password: '123456',
    });
    expect(result.status).toBe(201);
    return result.body;
  }

  async function animal(): Promise<Animal> {
    const result = await request<Animal[]>('/animals');
    expect(result.status).toBe(200);
    return result.body[0];
  }

  it('mantém saúde e filtros públicos', async () => {
    expect((await request('/health')).body).toEqual({
      status: 'ok',
      service: 'adotapet-api',
      mode: 'local-sem-docker',
    });
    expect(
      (await request<Animal[]>('/animals?city=S%C3%83O%20PAULO&species=CACHORRO')).body,
    ).toHaveLength(1);
    expect((await request('/animals?species=GATO')).body).toEqual([]);
    expect((await request('/animals?status=INVALIDO')).status).toBe(400);
    expect((await request('/animals/invalido')).status).toBe(400);
    expect((await request('/animals/' + randomUUID())).status).toBe(404);
  });

  it('valida cadastro, normaliza email e não expõe senha', async () => {
    const body = { name: ' Ana ', email: ' ANA@example.com ', password: '123456' };
    const result = await request<PublicUser>('/auth/register', 'POST', body);
    expect(result.status).toBe(201);
    expect(result.body).toEqual({
      id: expect.any(String),
      name: 'Ana',
      email: 'ana@example.com',
      role: 'ADOTANTE',
    });
    expect(store.users.get(result.body.id)?.passwordHash).not.toBe(body.password);
    expect((await request('/auth/register', 'POST', body)).status).toBe(409);
    expect((await request('/auth/register', 'POST', { ...body, role: 'ADMIN' })).status).toBe(400);
    expect((await request('/auth/register', 'POST', { ...body, name: ' ' })).status).toBe(400);
    expect((await request('/auth/register', 'POST', { ...body, password: 'x' })).status).toBe(400);
    expect(
      (await request('/auth/login', 'POST', { email: 'ANA@example.com', password: '123456' }))
        .status,
    ).toBe(201);
    expect(
      (await request('/auth/login', 'POST', { email: 'ana@example.com', password: 'errada' }))
        .status,
    ).toBe(401);
  });

  it('exige sessão real e rejeita token expirado ou previsível', async () => {
    const auth = await login('adotante');
    expect(auth.user).not.toHaveProperty('passwordHash');
    expect((await request('/applications/me')).status).toBe(401);
    expect(
      (await request('/applications/me', 'GET', undefined, 'local-token-' + auth.user.id)).status,
    ).toBe(401);
    expect((await request('/applications/me', 'GET', undefined, auth.accessToken)).status).toBe(
      200,
    );
    const malformed = await fetch(baseUrl + '/api/applications/me', {
      headers: { Authorization: auth.accessToken },
    });
    expect(malformed.status).toBe(401);
    store.sessions.get(auth.accessToken)!.expiresAt = Date.now() - 1;
    expect((await request('/applications/me', 'GET', undefined, auth.accessToken)).status).toBe(
      401,
    );
  });

  it('valida animais e impede alteração dos campos controlados pelo servidor', async () => {
    const ong = await login('ong');
    const adopter = await login('adotante');
    const body = {
      name: 'Lua',
      species: 'GATO',
      breed: 'SRD',
      sex: 'FEMEA',
      size: 'PEQUENO',
      city: 'Manaus',
      state: 'AM',
      age: 1,
      description: 'Dócil',
    };
    expect((await request('/animals', 'POST', body, adopter.accessToken)).status).toBe(403);
    for (const invalid of [
      { ...body, age: -1 },
      { ...body, age: '1' },
      { ...body, id: randomUUID() },
      { ...body, ongId: adopter.user.id },
      { ...body, status: 'ADOTADO' },
    ]) {
      expect((await request('/animals', 'POST', invalid, ong.accessToken)).status).toBe(400);
    }
    const created = await request<Animal>('/animals', 'POST', body, ong.accessToken);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...body, ongId: ong.user.id, status: 'DISPONIVEL' });
  });

  it('aprova apenas uma adoção e encerra as demais solicitações', async () => {
    const ong = await login('ong');
    const adopter = await login('adotante');
    await request('/auth/register', 'POST', {
      name: 'Outro',
      email: 'outro@adotapet.local',
      password: '123456',
    });
    const other = await login('outro');
    const pet = await animal();
    const path = '/animals/' + pet.id + '/applications';
    const first = await request<Application>(
      path,
      'POST',
      { reason: 'Quero adotar' },
      adopter.accessToken,
    );
    expect(first.status).toBe(201);
    expect((await request(path, 'POST', {}, adopter.accessToken)).status).toBe(409);
    expect((await request(path, 'POST', {}, ong.accessToken)).status).toBe(403);
    const second = await request<Application>(path, 'POST', {}, other.accessToken);
    expect(second.status).toBe(201);
    expect(
      (await request<Application[]>('/applications/me', 'GET', undefined, adopter.accessToken))
        .body,
    ).toHaveLength(1);
    expect(
      (await request<Application[]>('/applications/me', 'GET', undefined, ong.accessToken)).body,
    ).toHaveLength(2);
    const approved = await request<Application>(
      '/applications/' + first.body.id + '/approve',
      'PATCH',
      undefined,
      ong.accessToken,
    );
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APROVADA');
    expect((await animal()).status).toBe('ADOTADO');
    expect(
      (await request<Application[]>('/applications/me', 'GET', undefined, other.accessToken))
        .body[0].status,
    ).toBe('RECUSADA');
    expect(
      (
        await request(
          '/applications/' + second.body.id + '/approve',
          'PATCH',
          undefined,
          ong.accessToken,
        )
      ).status,
    ).toBe(409);
    expect((await request(path, 'POST', {}, other.accessToken)).status).toBe(409);
  });

  it('exige o responsável e mantém animal disponível após recusa', async () => {
    const ong = await login('ong');
    const adopter = await login('adotante');
    await request('/auth/register', 'POST', {
      name: 'Outra ONG',
      email: 'outra@adotapet.local',
      password: '123456',
      role: 'ONG',
    });
    const other = await login('outra');
    const pet = await animal();
    const created = await request<Application>(
      '/animals/' + pet.id + '/applications',
      'POST',
      {},
      adopter.accessToken,
    );
    const path = '/applications/' + created.body.id;
    expect((await request(path + '/approve', 'PATCH', undefined, other.accessToken)).status).toBe(
      403,
    );
    expect((await request(path + '/approve', 'PATCH', undefined, adopter.accessToken)).status).toBe(
      403,
    );
    expect(
      (await request<Application[]>('/applications/me', 'GET', undefined, other.accessToken)).body,
    ).toEqual([]);
    expect((await request(path + '/reject', 'PATCH', undefined, ong.accessToken)).status).toBe(200);
    expect((await animal()).status).toBe('DISPONIVEL');
    expect((await request(path + '/approve', 'PATCH', undefined, ong.accessToken)).status).toBe(
      409,
    );
  });

  it('permite ao administrador decidir sobre animais que cadastrou', async () => {
    const admin = await login('admin');
    const adopter = await login('adotante');
    const body = {
      name: 'Sol',
      species: 'GATO',
      breed: 'SRD',
      sex: 'MACHO',
      size: 'MEDIO',
      city: 'Manaus',
      state: 'AM',
      age: 2,
      description: '',
    };
    const pet = await request<Animal>('/animals', 'POST', body, admin.accessToken);
    const application = await request<Application>(
      '/animals/' + pet.body.id + '/applications',
      'POST',
      {},
      adopter.accessToken,
    );
    expect(
      (
        await request(
          '/applications/' + application.body.id + '/approve',
          'PATCH',
          undefined,
          admin.accessToken,
        )
      ).status,
    ).toBe(200);
  });

  it('documenta respostas, exemplos e autenticação das rotas existentes', async () => {
    const response = await fetch(baseUrl + '/docs-json');
    type Operation = {
      summary: string;
      responses: Record<
        string,
        { description: string; content?: Record<string, { example: unknown; schema: unknown }> }
      >;
      security?: unknown[];
    };
    const document = (await response.json()) as {
      components: {
        schemas: Record<string, unknown>;
        securitySchemes: Record<string, { scheme: string; bearerFormat?: string }>;
      };
      paths: Record<string, Record<string, Operation>>;
    };
    expect(response.status).toBe(200);
    expect(document.components.schemas).toHaveProperty('CreateAnimalDto');
    expect(document.components.schemas).toHaveProperty('RegisterDto');
    const expected: [string, string, number[]][] = [
      ['/api/auth/register', 'post', [201, 400, 409, 503]],
      ['/api/auth/login', 'post', [201, 400, 401]],
      ['/api/animals', 'get', [200, 400]],
      ['/api/animals', 'post', [201, 400, 401, 403, 503]],
      ['/api/animals/{id}', 'get', [200, 400, 404]],
      ['/api/animals/{animalId}/applications', 'post', [201, 400, 401, 403, 404, 409, 503]],
      ['/api/applications/me', 'get', [200, 401]],
      ['/api/applications/{id}/approve', 'patch', [200, 400, 401, 403, 404, 409, 503]],
      ['/api/applications/{id}/reject', 'patch', [200, 400, 401, 403, 404, 409, 503]],
      ['/api/health', 'get', [200]],
    ];
    for (const [path, method, codes] of expected) {
      const operation = document.paths[path][method];
      expect(operation.summary.length).toBeGreaterThan(0);
      for (const code of codes) {
        const result = operation.responses[code];
        expect(result.description.length).toBeGreaterThan(0);
        expect(result.content?.['application/json'].schema).toBeDefined();
        expect(result.content?.['application/json'].example).toBeDefined();
      }
    }
    expect(document.components.securitySchemes.bearer.scheme).toBe('bearer');
    expect(document.components.securitySchemes.bearer.bearerFormat).not.toBe('JWT');
    expect(document.paths['/api/animals'].post.security).toContainEqual({ bearer: [] });
    const loginResult = await login('adotante');
    const loginExample = document.paths['/api/auth/login'].post.responses[201].content![
      'application/json'
    ].example as LoginResponse;
    expect(Object.keys(loginResult).sort()).toEqual(Object.keys(loginExample).sort());
    expect(Object.keys(loginResult.user).sort()).toEqual(Object.keys(loginExample.user).sort());
    const invalid = await request<{ message: string; error: string; statusCode: number }>(
      '/applications/me',
    );
    const errorExample = document.paths['/api/applications/me'].get.responses[401].content![
      'application/json'
    ].example as object;
    expect(Object.keys(invalid.body).sort()).toEqual(Object.keys(errorExample).sort());
  });
});
