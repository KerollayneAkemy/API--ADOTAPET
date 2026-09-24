import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { StoreSnapshot, validateSnapshot } from './store-snapshot';
import { Animal, Application, User } from '../../domain/entities';
import { hashPassword } from '../../common/security/password';

/** Persistência em arquivo para uma instância local; sessões permanecem temporárias. */
@Injectable()
export class StoreService {
  readonly users = new Map<string, User>();
  readonly animals = new Map<string, Animal>();
  readonly applications = new Map<string, Application>();
  readonly sessions = new Map<string, { userId: string; expiresAt: number }>();

  private readonly filePath: string | null;

  constructor(@Optional() @Inject('STORE_FILE') filePath?: string) {
    const configured =
      filePath ?? process.env.DATA_FILE ?? resolve(process.cwd(), 'data', 'adotapet.json');
    this.filePath = configured === ':memory:' ? null : resolve(configured);
    if (this.filePath && existsSync(this.filePath)) {
      const snapshot: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'));
      validateSnapshot(snapshot);
      this.restore(snapshot);
      return;
    }
    const ong = this.seedUser('ONG Exemplo', 'ong', 'ONG');
    this.seedUser('Admin', 'admin', 'ADMIN');
    this.seedUser('Adotante Exemplo', 'adotante', 'ADOTANTE');
    const animal: Animal = {
      id: randomUUID(),
      name: 'Mel',
      species: 'CACHORRO',
      breed: 'SRD',
      sex: 'FEMEA',
      size: 'MEDIO',
      city: 'São Paulo',
      state: 'SP',
      age: 2,
      description: 'Cachorra dócil disponível para adoção.',
      status: 'DISPONIVEL',
      ongId: ong.id,
    };
    this.animals.set(animal.id, animal);
    this.persist();
  }

  /** Confirma todas as alterações de negócio juntas; restaura a memória se a gravação falhar. */
  commit<T>(change: () => T): T {
    const previous = this.snapshot();
    try {
      const result = change();
      this.persist();
      return result;
    } catch (error) {
      this.restore(previous);
      throw error;
    }
  }

  private snapshot(): StoreSnapshot {
    return structuredClone({
      version: 1,
      users: [...this.users.values()],
      animals: [...this.animals.values()],
      applications: [...this.applications.values()],
    });
  }

  private restore(snapshot: StoreSnapshot): void {
    this.users.clear();
    this.animals.clear();
    this.applications.clear();
    for (const user of snapshot.users) this.users.set(user.id, user);
    for (const animal of snapshot.animals) this.animals.set(animal.id, animal);
    for (const application of snapshot.applications)
      this.applications.set(application.id, application);
  }

  private persist(): void {
    if (!this.filePath) return;
    const temporary = this.filePath + '.' + randomUUID() + '.tmp';
    let descriptor: number | undefined;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify(this.snapshot(), null, 2), 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, this.filePath);
    } catch {
      throw new ServiceUnavailableException('Não foi possível salvar os dados. Tente novamente.');
    } finally {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          /* Preserva o erro original. */
        }
      }
      if (existsSync(temporary)) {
        try {
          unlinkSync(temporary);
        } catch {
          /* Arquivo temporário não substitui o original. */
        }
      }
    }
  }

  private seedUser(name: string, emailPrefix: string, role: User['role']): User {
    const user: User = {
      id: randomUUID(),
      name,
      email: emailPrefix + '@adotapet.local',
      passwordHash: hashPassword('123456'),
      role,
    };
    this.users.set(user.id, user);
    return user;
  }
}
