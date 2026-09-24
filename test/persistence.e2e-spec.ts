import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';
import { StoreService } from '../src/infrastructure/persistence/store.service';
import { Animal, Application, PublicUser } from '../src/domain/entities';

describe('Persistência local', () => {
  let directory: string;
  let file: string;
  let app: INestApplication | undefined;
  let url: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'adotapet-persistence-'));
    file = join(directory, 'data.json');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app?.close();
    app = undefined;
    rmSync(directory, { recursive: true, force: true });
  });

  async function start() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StoreService)
      .useFactory({ factory: () => new StoreService(file) })
      .compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  }

  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
  ): Promise<T> {
    const response = await fetch(url + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect(response.ok).toBe(true);
    return (await response.json()) as T;
  }

  async function login(email: string) {
    return request<{ accessToken: string; user: PublicUser }>('/auth/login', 'POST', {
      email,
      password: '123456',
    });
  }

  it('recupera cadastro, animal, solicitações e aprovação após recriar a aplicação', async () => {
    await start();
    await request('/auth/register', 'POST', {
      name: 'Pessoa',
      email: 'pessoa@example.com',
      password: '123456',
    });
    const ong = await login('ong@adotapet.local');
    const adopter = await login('pessoa@example.com');
    const other = await login('adotante@adotapet.local');
    const pet = await request<Animal>(
      '/animals',
      'POST',
      {
        name: 'Luna',
        species: 'GATO',
        breed: 'SRD',
        sex: 'FEMEA',
        size: 'PEQUENO',
        city: 'Cacoal',
        state: 'RO',
        age: 1,
        description: 'Dócil',
      },
      ong.accessToken,
    );
    const first = await request<Application>(
      '/animals/' + pet.id + '/applications',
      'POST',
      { reason: 'Quero adotar' },
      adopter.accessToken,
    );
    const second = await request<Application>(
      '/animals/' + pet.id + '/applications',
      'POST',
      {},
      other.accessToken,
    );
    await app!.close();
    await start();
    const ongAgain = await login('ong@adotapet.local');
    const adopterAgain = await login('pessoa@example.com');
    expect(ongAgain.user.id).toBe(ong.user.id);
    expect(adopterAgain.user.id).toBe(adopter.user.id);
    expect(
      await request<Application[]>('/applications/me', 'GET', undefined, adopterAgain.accessToken),
    ).toEqual([first]);
    const expired = await fetch(url + '/api/applications/me', {
      headers: { Authorization: 'Bearer ' + adopter.accessToken },
    });
    expect(expired.status).toBe(401);
    await request(
      '/applications/' + first.id + '/approve',
      'PATCH',
      undefined,
      ongAgain.accessToken,
    );
    await app!.close();
    await start();
    const finalOng = await login('ong@adotapet.local');
    expect((await request<Animal>('/animals/' + pet.id)).status).toBe('ADOTADO');
    const requests = await request<Application[]>(
      '/applications/me',
      'GET',
      undefined,
      finalOng.accessToken,
    );
    expect(requests.find((item) => item.id === first.id)?.status).toBe('APROVADA');
    expect(requests.find((item) => item.id === second.id)?.status).toBe('RECUSADA');
    expect(await request<Animal[]>('/animals')).toHaveLength(2);
    expect(readFileSync(file, 'utf8')).not.toContain(ong.accessToken);
  });

  it('recusa arquivo inválido sem substituir os dados', () => {
    writeFileSync(file, '{invalid');
    expect(() => new StoreService(file)).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{invalid');
    writeFileSync(
      file,
      JSON.stringify({ version: 1, users: [], animals: [{ id: 'inválido' }], applications: [] }),
    );
    expect(() => new StoreService(file)).toThrow('Arquivo de dados inválido');
  });

  it('retorna 503 e restaura memória e arquivo se a gravação falhar', async () => {
    await start();
    const original = readFileSync(file, 'utf8');
    const fault = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Falha simulada');
    });
    const response = await fetch(url + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Teste', email: 'falha@example.com', password: '123456' }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: 'Não foi possível salvar os dados. Tente novamente.',
      error: 'Service Unavailable',
      statusCode: 503,
    });
    expect(
      [...app!.get(StoreService).users.values()].some((user) => user.email === 'falha@example.com'),
    ).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(original);
    fault.mockRestore();
    await request('/auth/register', 'POST', {
      name: 'Teste',
      email: 'falha@example.com',
      password: '123456',
    });
    expect(new StoreService(file).users.size).toBe(4);
  });
});
