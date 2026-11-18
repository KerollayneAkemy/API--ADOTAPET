import { signAccessToken, verifyAccessToken } from '../src/common/security/jwt';
import { HealthController } from '../src/modules/health/controllers/health.controller';
import { AnimalsController } from '../src/modules/animals/controllers/animals.controller';
import { ApplicationsService } from '../src/modules/applications/services/applications.service';
import { DatabaseService } from '../src/infrastructure/persistence/database.service';
import { IdempotencyService } from '../src/infrastructure/persistence/idempotency.service';
import { RedisRateLimitService } from '../src/infrastructure/rate-limit/redis-rate-limit.service';
import { Application, PublicUser } from '../src/domain/entities';
import { R2StorageService } from '../src/infrastructure/storage/r2-storage.service';
import { AnimalsService } from '../src/modules/animals/services/animals.service';
import type { Response } from 'express';
import { S3Client } from '@aws-sdk/client-s3';
import { createHmac } from 'node:crypto';

describe('JWT de acesso', () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-secret-with-at-least-32-bytes';
  });
  afterAll(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it('assina e valida claims com expiração e perfil', () => {
    const token = signAccessToken('00000000-0000-4000-8000-000000000001', 'ONG');
    expect(verifyAccessToken(token)).toMatchObject({
      sub: '00000000-0000-4000-8000-000000000001',
      role: 'ONG',
    });
  });

  it('rejeita tokens alterados, inválidos e com algoritmo diferente', () => {
    const token = signAccessToken('00000000-0000-4000-8000-000000000001', 'ADOTANTE');
    expect(verifyAccessToken(token + 'x')).toBeNull();
    expect(verifyAccessToken('not-a-token')).toBeNull();
    const payload = token.split('.')[1];
    const signature = token.split('.')[2];
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    expect(verifyAccessToken(`${noneHeader}.${payload}.${signature}`)).toBeNull();
  });

  it('rejeita token expirado', () => {
    const token = signAccessToken('00000000-0000-4000-8000-000000000001', 'ONG');
    const [header, payload] = token.split('.');
    const expired = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), exp: 1 }),
    ).toString('base64url');
    const unsigned = `${header}.${expired}`;
    const validSignature = createHmac('sha256', 'unit-test-secret-with-at-least-32-bytes')
      .update(unsigned)
      .digest('base64url');
    expect(verifyAccessToken(`${unsigned}.${validSignature}`)).toBeNull();
  });
});

describe('Resposta de saúde da API', () => {
  it('inclui horário UTC da resposta e não expõe modo de execução', () => {
    const response = new HealthController().health();
    expect(response).toMatchObject({ status: 'ok', service: 'adotapet-api' });
    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(response).not.toHaveProperty('mode');
  });
});

describe('Prévia responsiva de foto', () => {
  const animalId = '00000000-0000-4000-8000-000000000002';
  const photoId = '123e4567-e89b-42d3-a456-426614174000.jpg';
  const signedUrl = 'https://private.example/photo.jpg?signature=abc&expires=900';

  const createResponse = () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
      type: jest.fn(),
      send: jest.fn(),
      redirect: jest.fn(),
    };
    response.status.mockReturnValue(response);
    response.type.mockReturnValue(response);
    return response;
  };

  it('mostra a imagem limitada à janela ao abrir no navegador', async () => {
    const service = { getPhotoReadUrl: jest.fn().mockResolvedValue(signedUrl) };
    const controller = new AnimalsController(service as unknown as AnimalsService);
    const response = createResponse();

    await controller.getPhoto(
      animalId,
      photoId,
      'text/html,application/xhtml+xml',
      response as unknown as Response,
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.type).toHaveBeenCalledWith('html');
    expect(response.send.mock.calls[0][0]).toContain('width:min(360px,84vw,72vh)');
    expect(response.send.mock.calls[0][0]).toContain('height:min(360px,84vw,72vh)');
    expect(response.send.mock.calls[0][0]).toContain('expires=900');
    expect(response.send.mock.calls[0][0]).toContain('&amp;');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('mantém redirecionamento para clientes de API', async () => {
    const service = { getPhotoReadUrl: jest.fn().mockResolvedValue(signedUrl) };
    const controller = new AnimalsController(service as unknown as AnimalsService);
    const response = createResponse();

    await controller.getPhoto(animalId, photoId, '*/*', response as unknown as Response);

    expect(response.redirect).toHaveBeenCalledWith(302, signedUrl);
    expect(response.send).not.toHaveBeenCalled();
  });
});

describe('Cloudflare R2 privado', () => {
  const savedEnv = { ...process.env };
  let send: jest.SpyInstance;

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET = 'private-test-bucket';
    send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
  });

  afterEach(() => {
    send.mockRestore();
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  const jpeg = (): Express.Multer.File => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    return { buffer, size: buffer.length, mimetype: 'image/jpeg' } as Express.Multer.File;
  };

  it('envia conteúdo válido e produz URL de leitura assinada sem tornar bucket público', async () => {
    const storage = new R2StorageService();
    const uploaded = await storage.upload('animal-id', jpeg());
    expect(uploaded.objectKey).toMatch(/^animals\/animal-id\/.+\.jpg$/);
    expect((send.mock.calls[0][0] as { input: { ACL?: string } }).input.ACL).toBeUndefined();
    expect(await storage.getReadUrl('animal-id', uploaded.photoId)).toContain('X-Amz-Signature=');
  });

  it('valida assinatura e tamanho e converte falha do provedor em 503', async () => {
    const storage = new R2StorageService();
    await expect(
      storage.upload('animal-id', { ...jpeg(), mimetype: 'image/png' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      storage.upload('animal-id', { ...jpeg(), size: 8 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ status: 400 });
    send.mockRejectedValueOnce(new Error('upstream secret detail'));
    await expect(storage.upload('animal-id', jpeg())).rejects.toMatchObject({ status: 503 });
  });
});

describe('Permissão e vínculo das fotos', () => {
  it('nega envio por terceiros e persiste a referência antes de expor URL de leitura', async () => {
    const photoId = '123e4567-e89b-42d3-a456-426614174000.jpg';
    const animalRow = {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Mel',
      species: 'GATO',
      breed: 'SRD',
      sex: 'FEMEA',
      size: 'PEQUENO',
      city: 'Manaus',
      state: 'AM',
      age: 2,
      description: 'Teste',
      status: 'DISPONIVEL',
      ongId: '00000000-0000-4000-8000-000000000003',
      photos: [photoId],
    };
    const database = {
      query: jest.fn(async () => ({ rows: [animalRow], rowCount: 1 })),
    } as unknown as DatabaseService;
    const storage = {
      upload: jest.fn(async () => ({ photoId, objectKey: `animals/${animalRow.id}/${photoId}` })),
      getReadUrl: jest.fn(async () => 'https://private.example/signed'),
      remove: jest.fn(),
    } as unknown as R2StorageService;
    const idempotency = {
      execute: jest.fn(async (_scope, _key, _body, work) => {
        const result = await work({
          query: async () => ({ rows: [animalRow], rowCount: 1 }),
        } as never);
        return { statusCode: 201, body: result };
      }),
    } as unknown as IdempotencyService;
    const service = new AnimalsService(database, idempotency, storage);
    const owner: PublicUser = {
      id: animalRow.ongId,
      name: 'ONG',
      email: 'ong@example.test',
      role: 'ONG',
    };
    const stranger: PublicUser = {
      id: '00000000-0000-4000-8000-000000000009',
      name: 'Outra ONG',
      email: 'outra@example.test',
      role: 'ONG',
    };
    const file = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      size: 4,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await expect(
      service.uploadPhoto(stranger, animalRow.id, file, 'photo-key-123456'),
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.upload).not.toHaveBeenCalled();

    const result = await service.uploadPhoto(owner, animalRow.id, file, 'photo-key-123456');
    expect(result.photoUrl).toBe(`/api/animals/${animalRow.id}/photos/${photoId}`);
    expect(result.animal.photos).toEqual([`/api/animals/${animalRow.id}/photos/${photoId}`]);
    expect(await service.getPhotoReadUrl(animalRow.id, photoId)).toBe(
      'https://private.example/signed',
    );
    expect(storage.getReadUrl).toHaveBeenCalledWith(animalRow.id, photoId);
  });
});

describe('Limite local de testes', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLimit = process.env.RATE_LIMIT_MAX;
  const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_MAX = '2';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalLimit === undefined) delete process.env.RATE_LIMIT_MAX;
    else process.env.RATE_LIMIT_MAX = originalLimit;
    if (originalWindow === undefined) delete process.env.RATE_LIMIT_WINDOW_MS;
    else process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
  });

  it('retorna 429 depois do limite configurado', async () => {
    const limiter = new RedisRateLimitService();
    await limiter.check('unit:client');
    await limiter.check('unit:client');
    await expect(limiter.check('unit:client')).rejects.toMatchObject({ status: 429 });
  });
});

describe('Idempotência das solicitações', () => {
  it('reproduz a resposta e recusa reutilização da chave com outro conteúdo', async () => {
    const storedKeys = new Map<string, { request_hash: string; response: unknown }>();
    let createdApplications = 0;
    const client = {
      query: jest.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.startsWith('SELECT request_hash,response')) {
          const saved = storedKeys.get(String(values[1]));
          return { rows: saved ? [saved] : [] };
        }
        if (sql.startsWith('SELECT status FROM animals'))
          return { rows: [{ status: 'DISPONIVEL' }] };
        if (sql.startsWith('INSERT INTO applications')) {
          createdApplications += 1;
          return { rows: [] };
        }
        if (sql.startsWith('INSERT INTO idempotency_keys')) {
          storedKeys.set(String(values[1]), {
            request_hash: String(values[2]),
            response: JSON.parse(String(values[3])) as unknown,
          });
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };
    const database = {
      transaction: (work: (connection: typeof client) => Promise<unknown>) => work(client),
    } as unknown as DatabaseService;
    const records = new Map<string, { request: string; body: unknown }>();
    const idem = {
      execute: async (
        _scope: string,
        key: string,
        request: unknown,
        work: (client: never) => Promise<unknown>,
      ) => {
        const saved = records.get(key);
        if (saved) {
          if (saved.request !== JSON.stringify(request))
            throw new Error('Idempotency-Key já foi usada com outra requisição');
          return { statusCode: 201, body: saved.body };
        }
        const body = await database.transaction((connection) => work(connection as never));
        records.set(key, { request: JSON.stringify(request), body });
        return { statusCode: 201, body };
      },
    } as unknown as IdempotencyService;
    const service = new ApplicationsService(database, idem);
    const adopter: PublicUser = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Pessoa',
      email: 'pessoa@example.test',
      role: 'ADOTANTE',
    };
    const key = 'unit-key-12345678';
    const first = await service.create(
      adopter,
      '00000000-0000-4000-8000-000000000002',
      { reason: 'Quero adotar' },
      key,
    );
    const replay = await service.create(
      adopter,
      '00000000-0000-4000-8000-000000000002',
      { reason: 'Quero adotar' },
      key,
    );

    expect(replay).toEqual(first);
    expect(createdApplications).toBe(1);
    await expect(
      service.create(
        adopter,
        '00000000-0000-4000-8000-000000000002',
        { reason: 'Outro motivo' },
        key,
      ),
    ).rejects.toThrow('Idempotency-Key já foi usada com outra requisição');
  });
});

describe('Decisões concorrentes', () => {
  it('só permite uma aprovação para o mesmo animal', async () => {
    const animalId = '00000000-0000-4000-8000-000000000002';
    const animal = {
      id: animalId,
      ong_id: '00000000-0000-4000-8000-000000000003',
      status: 'DISPONIVEL',
    };
    const applications = new Map<string, Application>([
      [
        '00000000-0000-4000-8000-000000000004',
        {
          id: '00000000-0000-4000-8000-000000000004',
          animalId,
          adopterId: '00000000-0000-4000-8000-000000000005',
          reason: '',
          status: 'PENDENTE',
        },
      ],
      [
        '00000000-0000-4000-8000-000000000006',
        {
          id: '00000000-0000-4000-8000-000000000006',
          animalId,
          adopterId: '00000000-0000-4000-8000-000000000007',
          reason: '',
          status: 'PENDENTE',
        },
      ],
    ]);
    const client = {
      query: jest.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.startsWith('SELECT animal_id FROM applications')) {
          const application = applications.get(String(values[0]));
          return { rows: application ? [{ animal_id: application.animalId }] : [] };
        }
        if (sql.startsWith('SELECT id,ong_id,status FROM animals')) {
          expect(sql).toContain('FOR UPDATE');
          return { rows: [animal] };
        }
        if (sql.startsWith('SELECT id,animal_id AS')) {
          expect(sql).toContain('FOR UPDATE');
          const application = applications.get(String(values[0]));
          return { rows: application ? [application] : [] };
        }
        if (sql.startsWith('UPDATE applications SET status=$1 WHERE id=$2')) {
          const application = applications.get(String(values[1]));
          if (application) application.status = String(values[0]) as Application['status'];
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE animals SET status='ADOTADO'")) {
          animal.status = 'ADOTADO';
          return { rows: [] };
        }
        if (sql.startsWith("UPDATE applications SET status='RECUSADA'")) {
          for (const application of applications.values()) {
            if (
              application.animalId === values[0] &&
              application.id !== values[1] &&
              application.status === 'PENDENTE'
            ) {
              application.status = 'RECUSADA';
            }
          }
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };
    let transactionQueue = Promise.resolve();
    const database = {
      transaction: async (work: (connection: typeof client) => Promise<unknown>) => {
        const previous = transactionQueue;
        let release!: () => void;
        transactionQueue = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await work(client);
        } finally {
          release();
        }
      },
    } as unknown as DatabaseService;
    const service = new ApplicationsService(database, {} as IdempotencyService);
    const ong: PublicUser = {
      id: animal.ong_id,
      name: 'ONG',
      email: 'ong@example.test',
      role: 'ONG',
    };

    const decisions = await Promise.allSettled([
      service.decide(ong, '00000000-0000-4000-8000-000000000004', true),
      service.decide(ong, '00000000-0000-4000-8000-000000000006', true),
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = decisions.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.getStatus()).toBe(409);
    expect(animal.status).toBe('ADOTADO');
  });
});
