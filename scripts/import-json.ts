import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

type Snapshot = {
  version: number;
  users: { id: string; name: string; email: string; passwordHash: string; role: string }[];
  animals: { id: string; name: string; species: string; breed: string; sex: string; size: string; city: string; state: string; age: number; description: string; status: string; ongId: string; photos?: string[] }[];
  applications: { id: string; animalId: string; adopterId: string; reason: string; status: string }[];
};

async function main(): Promise<void> {
  const file = resolve(process.argv[2] ?? process.env.DATA_FILE ?? 'data/adotapet.json');
  const snapshot = JSON.parse(await readFile(file, 'utf8')) as Snapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.users) || !Array.isArray(snapshot.animals) || !Array.isArray(snapshot.applications)) {
    throw new Error('O arquivo não corresponde ao formato de dados JSON v1 do AdotaPet.');
  }
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para o PostgreSQL de destino.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const user of snapshot.users) await client.query(
      'INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
      [user.id, user.name, user.email, user.passwordHash, user.role],
    );
    for (const animal of snapshot.animals) await client.query(
      'INSERT INTO animals(id,name,species,breed,sex,size,city,state,age,description,status,ong_id,photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING',
      [animal.id, animal.name, animal.species, animal.breed, animal.sex, animal.size, animal.city, animal.state, animal.age, animal.description, animal.status, animal.ongId, animal.photos ?? []],
    );
    for (const application of snapshot.applications) await client.query(
      'INSERT INTO applications(id,animal_id,adopter_id,reason,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',
      [application.id, application.animalId, application.adopterId, application.reason, application.status],
    );
    await client.query('COMMIT');
    process.stdout.write(`Importadas ${snapshot.users.length} contas, ${snapshot.animals.length} animais e ${snapshot.applications.length} solicitações.\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 1;
});
