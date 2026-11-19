import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../common/security/password';
import { logJson } from '../../common/observability/json-logger';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_SIZE ?? 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
  }

  async onModuleInit(): Promise<void> {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório.');
    const secret = process.env.JWT_SECRET ?? '';
    this.assertSecret('JWT_SECRET', secret, 32);
    this.validateDatabaseCredential(process.env.DATABASE_URL);
    this.validateR2Configuration();
    await this.pool.query('SELECT 1');
    await this.runMigrations();
    if (process.env.SEED_DEMO_DATA === 'true') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SEED_DEMO_DATA não pode ser ativado em produção.');
      }
      const seedPassword = process.env.DEMO_SEED_PASSWORD ?? '';
      this.assertSecret('DEMO_SEED_PASSWORD', seedPassword, 12);
      await this.seedDemoData(seedPassword);
    }
  }

  private assertSecret(name: string, value: string, minimumBytes: number): void {
    if (
      Buffer.byteLength(value) < minimumBytes ||
      /(change\s*me|replace|your[_ -]?(secret|password|key)|placeholder|example|dummy)/i.test(value)
    ) {
      throw new Error(`${name} está ausente, é fraco ou ainda contém um valor de exemplo.`);
    }
  }

  private validateDatabaseCredential(connectionString: string): void {
    let password: string;
    try {
      password = new URL(connectionString).password;
    } catch {
      throw new Error('DATABASE_URL deve ser uma URL PostgreSQL válida.');
    }
    if (password) this.assertSecret('Senha do PostgreSQL em DATABASE_URL', password, 16);
  }

  private validateR2Configuration(): void {
    const names = [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ] as const;
    const values = names.map((name) => process.env[name] ?? '');
    if (values.every((value) => !value)) return;
    if (values.some((value) => !value)) {
      throw new Error('Configure todas as variáveis R2_* ou deixe todas vazias.');
    }
    this.assertSecret('R2_ACCESS_KEY_ID', process.env.R2_ACCESS_KEY_ID!, 8);
    this.assertSecret('R2_SECRET_ACCESS_KEY', process.env.R2_SECRET_ACCESS_KEY!, 24);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const startedAt = Date.now();
    const operation = sql.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? 'UNKNOWN';
    return this.pool
      .query<T>(sql, values)
      .then((result) => {
        logJson('info', 'database.query', {
          operation,
          rowCount: result.rowCount,
          durationMs: Date.now() - startedAt,
        });
        return result;
      })
      .catch((error: unknown) => {
        logJson('error', 'database.query_failed', {
          operation,
          durationMs: Date.now() - startedAt,
          errorType: error instanceof Error ? error.name : typeof error,
        });
        throw error;
      });
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      logJson('info', 'database.transaction', {
        outcome: 'committed',
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logJson('error', 'database.transaction', {
        outcome: 'rolled_back',
        durationMs: Date.now() - startedAt,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Uma trava global impede duas réplicas de aplicar a mesma migração ao iniciar juntas.
      await client.query('SELECT pg_advisory_lock(741920261)');
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
      );
      const directory = join(process.cwd(), 'migrations');
      const files = (await readdir(directory)).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
      for (const name of files) {
        const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [
          name,
        ]);
        if (rowCount) continue;
        const sql = await readFile(join(directory, name), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(741920261)');
      client.release();
    }
  }

  private async seedDemoData(seedPassword: string): Promise<void> {
    const users = [
      { name: 'ONG Exemplo', prefix: 'ong', role: 'ONG' },
      { name: 'Admin', prefix: 'admin', role: 'ADMIN' },
      { name: 'Adotante Exemplo', prefix: 'adotante', role: 'ADOTANTE' },
    ] as const;
    for (const item of users) {
      await this.pool.query(
        'INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING',
        [
          randomUUID(),
          item.name,
          `${item.prefix}@adotapet.local`,
          hashPassword(seedPassword),
          item.role,
        ],
      );
    }
    const count = await this.pool.query('SELECT 1 FROM animals LIMIT 1');
    if (!count.rowCount) {
      const ong = await this.pool.query<{ id: string }>(
        "SELECT id FROM users WHERE email='ong@adotapet.local'",
      );
      if (ong.rows[0])
        await this.pool.query(
          "INSERT INTO animals(id,name,species,breed,sex,size,city,state,age,description,status,ong_id) VALUES($1,'Mel','CACHORRO','SRD','FEMEA','MEDIO','São Paulo','SP',2,'Cachorra dócil disponível para adoção.','DISPONIVEL',$2)",
          [randomUUID(), ong.rows[0].id],
        );
    }
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
