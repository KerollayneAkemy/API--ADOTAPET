import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Animal, PublicUser } from '../../../domain/entities';
import { CreateAnimalDto } from '../dto/create-animal.dto';
import { ListAnimalsDto } from '../dto/list-animals.dto';
import { DatabaseService } from '../../../infrastructure/persistence/database.service';
import { IdempotencyService } from '../../../infrastructure/persistence/idempotency.service';
import { R2StorageService } from '../../../infrastructure/storage/r2-storage.service';
import { logJson } from '../../../common/observability/json-logger';

@Injectable()
export class AnimalsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
    private readonly storage: R2StorageService,
  ) {}

  async list(filters: ListAnimalsDto): Promise<Animal[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      clauses.push(`${column} = $${values.length}`);
    };
    if (filters.species) add('species', filters.species);
    if (filters.city) add('lower(city)', filters.city.toLowerCase());
    if (filters.status) add('status', filters.status);
    const result = await this.database.query<Animal>(
      `SELECT id,name,species,breed,sex,size,city,state,age,description,status,ong_id AS "ongId",photos FROM animals${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''} ORDER BY name`,
      values,
    );
    return result.rows.map((animal) => this.toPublicAnimal(animal));
  }

  async get(id: string): Promise<Animal> {
    const result = await this.database.query<Animal>(
      'SELECT id,name,species,breed,sex,size,city,state,age,description,status,ong_id AS "ongId",photos FROM animals WHERE id=$1',
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Animal não encontrado');
    return this.toPublicAnimal(result.rows[0]);
  }

  async create(user: PublicUser, data: CreateAnimalDto, idempotencyKey?: string): Promise<Animal> {
    if (user.role !== 'ONG' && user.role !== 'ADMIN')
      throw new ForbiddenException('Apenas ONG ou administrador pode cadastrar animais');
    const animal: Animal = {
      ...data,
      id: randomUUID(),
      status: 'DISPONIVEL',
      ongId: user.id,
      photos: [],
    };
    const result = await this.idempotency.execute(
      `user:${user.id}:POST:/animals`,
      idempotencyKey,
      data,
      async (client) => {
        await client.query(
          'INSERT INTO animals(id,name,species,breed,sex,size,city,state,age,description,status,ong_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [
            animal.id,
            animal.name,
            animal.species,
            animal.breed,
            animal.sex,
            animal.size,
            animal.city,
            animal.state,
            animal.age,
            animal.description,
            animal.status,
            animal.ongId,
          ],
        );
        return animal;
      },
    );
    logJson('info', 'animal.created', { actorId: user.id, animalId: result.body.id });
    return result.body;
  }

  async uploadPhoto(
    user: PublicUser,
    animalId: string,
    file: Express.Multer.File,
    idempotencyKey?: string,
  ): Promise<{ animal: Animal; photoUrl: string }> {
    await this.assertCanManage(user, animalId);
    let uploadedKey: string | undefined;
    try {
      const result = await this.idempotency.execute(
        `user:${user.id}:POST:/animals/:id/photos`,
        idempotencyKey,
        {
          animalId,
          mimeType: file.mimetype,
          contentHash: createHash('sha256').update(file.buffer).digest('hex'),
        },
        async (client) => {
          const uploaded = await this.storage.upload(animalId, file);
          uploadedKey = uploaded.objectKey;
          const updated = await client.query<Animal>(
            'UPDATE animals SET photos=array_append(photos,$1) WHERE id=$2 RETURNING id,name,species,breed,sex,size,city,state,age,description,status,ong_id AS "ongId",photos',
            [uploaded.photoId, animalId],
          );
          if (!updated.rows[0]) throw new NotFoundException('Animal não encontrado');
          return {
            animal: this.toPublicAnimal(updated.rows[0]),
            photoUrl: `/api/animals/${animalId}/photos/${uploaded.photoId}`,
          };
        },
      );
      logJson('info', 'animal.photo_uploaded', {
        actorId: user.id,
        animalId,
        photoCount: result.body.animal.photos.length,
      });
      return result.body;
    } catch (error) {
      if (uploadedKey) {
        try {
          await this.storage.remove(uploadedKey);
        } catch {
          // Não substitui o erro original da transação.
        }
      }
      throw error;
    }
  }

  async getPhotoReadUrl(animalId: string, photoId: string): Promise<string> {
    const stored = await this.database.query(
      'SELECT 1 FROM animals WHERE id=$1 AND photos @> ARRAY[$2]::text[]',
      [animalId, photoId],
    );
    if (!stored.rowCount) throw new NotFoundException('Foto não encontrada');
    const url = await this.storage.getReadUrl(animalId, photoId);
    logJson('info', 'animal.photo_accessed', { animalId, photoId });
    return url;
  }

  async assertCanManage(user: PublicUser, animalId: string): Promise<void> {
    const animal = await this.get(animalId);
    if ((user.role !== 'ONG' && user.role !== 'ADMIN') || animal.ongId !== user.id)
      throw new ForbiddenException('Você não é responsável por este animal');
  }

  private toPublicAnimal(animal: Animal): Animal {
    return {
      ...animal,
      photos: (animal.photos ?? []).map((photoId) => `/api/animals/${animal.id}/photos/${photoId}`),
    };
  }
}
