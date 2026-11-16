import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { hashPassword } from '../src/common/security/password';
import { signAccessToken } from '../src/common/security/jwt';
import { DatabaseService } from '../src/infrastructure/persistence/database.service';

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw new Error(
    'DATABASE_URL e REDIS_URL são obrigatórios para a suíte e2e; use docker compose --profile test run --build --rm integration-tests.',
  );
}

describe('AdotaPet PostgreSQL integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  const responses: Response[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ??= randomUUID() + randomUUID();
    process.env.RATE_LIMIT_MAX = '100';
    await startApi();
  });

  async function startApi() {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }

  afterAll(async () => app?.close());

  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
    key?: string,
  ) {
    const response = await fetch(baseUrl + '/api' + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    responses.push(response);
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      body: (await response.json()) as T,
      requestId: response.headers.get('x-request-id'),
    };
  }

  async function registerAndLogin(role: 'ONG' | 'ADOTANTE', suffix: string) {
    const emailPrefix = suffix.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const email = `${emailPrefix}-${randomUUID()}@example.test`;
    const registration = await request(
      '/auth/register',
      'POST',
      {
        name: suffix,
        email,
        password: 'Senha-segura-123',
        role,
      },
      undefined,
      `register-${randomUUID()}`,
    );
    expect(registration.status).toBe(201);
    const result = await request<{ accessToken: string }>('/auth/login', 'POST', {
      email,
      password: 'Senha-segura-123',
    });
    expect(result.status).toBe(201);
    return result.body.accessToken;
  }

  it('propaga Request-ID, autentica com JWT, memoriza idempotência e serializa aprovações concorrentes', async () => {
    const health = await request<{ status: string }>('/health');
    expect(health.status).toBe(200);
    expect(health.requestId).toMatch(/^[\w.-]{1,128}$/);
    const openApi = (await (await fetch(baseUrl + '/docs-json')).json()) as {
      components: { securitySchemes: Record<string, { bearerFormat?: string }> };
      paths: Record<
        string,
        Record<
          string,
          {
            parameters?: { name: string }[];
            responses: Record<string, unknown>;
            requestBody?: unknown;
          }
        >
      >;
    };
    expect(openApi.components.securitySchemes.bearer.bearerFormat).toBe('JWT');
    expect(openApi.paths['/api/animals/{id}/photos'].post.requestBody).toBeDefined();
    expect(openApi.paths['/api/animals/{animalId}/applications'].post.parameters).toContainEqual(
      expect.objectContaining({ name: 'Idempotency-Key' }),
    );
    expect(openApi.paths['/api/applications/me'].get.responses).toHaveProperty('429');

    const ongToken = await registerAndLogin('ONG', 'ONG teste');
    const otherOngToken = await registerAndLogin('ONG', 'Outra ONG');
    const adopterToken = await registerAndLogin('ADOTANTE', 'Adotante teste');
    const secondAdopterToken = await registerAndLogin('ADOTANTE', 'Outro adotante');
    const animal = await request<{ id: string }>(
      '/animals',
      'POST',
      {
        name: 'Animal de integração',
        species: 'GATO',
        breed: 'SRD',
        sex: 'FEMEA',
        size: 'PEQUENO',
        city: 'Manaus',
        state: 'AM',
        age: 2,
        description: 'Teste de integração',
      },
      ongToken,
      `animal-${randomUUID()}`,
    );
    expect(animal.status).toBe(201);

    const missingKey = await request(
      '/animals',
      'POST',
      {
        name: 'Sem chave',
        species: 'GATO',
        breed: 'SRD',
        sex: 'FEMEA',
        size: 'PEQUENO',
        city: 'Manaus',
        state: 'AM',
        age: 1,
        description: 'Deve ser rejeitado',
      },
      ongToken,
    );
    expect(missingKey.status).toBe(400);
    expect(missingKey.contentType).toContain('application/problem+json');
    expect(missingKey.body).toHaveProperty('requestId');

    const animalPath = `/animals/${animal.body.id}/applications`;
    const key = `integration-${randomUUID()}`;
    const [first, replay] = await Promise.all([
      request(animalPath, 'POST', { reason: 'Pedido idem' }, adopterToken, key),
      request(animalPath, 'POST', { reason: 'Pedido idem' }, adopterToken, key),
    ]);
    expect(first.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    // Um processo novo recupera a resposta registrada no PostgreSQL, sem estado em memória.
    await app.close();
    await startApi();
    const persistedReplay = await request(
      animalPath,
      'POST',
      { reason: 'Pedido idem' },
      adopterToken,
      key,
    );
    expect(persistedReplay.status).toBe(201);
    expect(persistedReplay.body).toEqual(first.body);
    const changedPayload = await request(
      animalPath,
      'POST',
      { reason: 'Conteúdo diferente' },
      adopterToken,
      key,
    );
    expect(changedPayload.status).toBe(409);
    expect(changedPayload.contentType).toContain('application/problem+json');
    const duplicatePending = await request(
      animalPath,
      'POST',
      { reason: 'Outro pedido pendente da mesma pessoa' },
      adopterToken,
      `duplicate-${randomUUID()}`,
    );
    expect(duplicatePending.status).toBe(409);
    const second = await request<{ id: string }>(
      `/animals/${animal.body.id}/applications`,
      'POST',
      {},
      secondAdopterToken,
      `application-${randomUUID()}`,
    );
    expect(second.status).toBe(201);

    const firstDecision = `/applications/${(first.body as { id: string }).id}/approve`;
    const secondDecision = `/applications/${second.body.id}/approve`;
    const deniedOngDecision = await request(firstDecision, 'PATCH', undefined, otherOngToken);
    expect(deniedOngDecision.status).toBe(403);
    const adminId = randomUUID();
    await app
      .get(DatabaseService)
      .query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)', [
        adminId,
        'Admin de integração',
        `${adminId}@example.test`,
        hashPassword(randomUUID()),
        'ADMIN',
      ]);
    const deniedAdminDecision = await request(
      firstDecision,
      'PATCH',
      undefined,
      signAccessToken(adminId, 'ADMIN'),
    );
    expect(deniedAdminDecision.status).toBe(403);
    const decisions = await Promise.all([
      request(firstDecision, 'PATCH', undefined, ongToken),
      request(secondDecision, 'PATCH', undefined, ongToken),
    ]);
    expect(decisions.filter((result) => result.status === 200)).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 409)).toHaveLength(1);
    const finalAnimalState = await app.get(DatabaseService).query<{
      animal_status: string;
      approved_count: string;
      rejected_count: string;
    }>(
      `SELECT pet.status AS animal_status,
              count(*) FILTER (WHERE app.status='APROVADA') AS approved_count,
              count(*) FILTER (WHERE app.status='RECUSADA') AS rejected_count
       FROM animals pet JOIN applications app ON app.animal_id=pet.id
       WHERE pet.id=$1 GROUP BY pet.status`,
      [animal.body.id],
    );
    expect(finalAnimalState.rows[0]).toMatchObject({
      animal_status: 'ADOTADO',
      approved_count: '1',
      rejected_count: '1',
    });
    const requestForAdoptedAnimal = await request(
      animalPath,
      'POST',
      { reason: 'Tentativa após adoção' },
      secondAdopterToken,
      `adopted-${randomUUID()}`,
    );
    expect(requestForAdoptedAnimal.status).toBe(409);

    // O limite global usa Redis; chamadas suficientes nesta janela devem produzir RFC 7807/429.
    let limited = false;
    for (let i = 0; i < 110; i += 1) {
      const result = await request('/health');
      if (result.status === 429) {
        expect(result.contentType).toContain('application/problem+json');
        expect(result.body).toHaveProperty('requestId');
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
    expect(responses.some((response) => response.status === 429)).toBe(true);
  });
});
