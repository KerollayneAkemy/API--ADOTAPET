import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { Application, PublicUser } from '../../../domain/entities';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { DatabaseService } from '../../../infrastructure/persistence/database.service';
import { IdempotencyService } from '../../../infrastructure/persistence/idempotency.service';
import { logJson } from '../../../common/observability/json-logger';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(
    user: PublicUser,
    animalId: string,
    data: CreateApplicationDto,
    idempotencyKey?: string,
  ): Promise<Application> {
    if (user.role !== 'ADOTANTE')
      throw new ForbiddenException('Apenas adotante pode solicitar adoção');
    const result = await this.idempotency.execute(
      `user:${user.id}:POST:/animals/:animalId/applications`,
      idempotencyKey,
      { animalId, data },
      (client) => this.createWithinTransaction(user, animalId, data, client),
    );
    logJson('info', 'adoption.application_created', {
      actorId: user.id,
      applicationId: result.body.id,
      animalId,
    });
    return result.body;
  }

  private async createWithinTransaction(
    user: PublicUser,
    animalId: string,
    data: CreateApplicationDto,
    client: PoolClient,
  ): Promise<Application> {
    const animalResult = await client.query<{ status: string }>(
      'SELECT status FROM animals WHERE id=$1 FOR UPDATE',
      [animalId],
    );
    const animal = animalResult.rows[0];
    if (!animal) throw new NotFoundException('Animal não encontrado');
    if (animal.status !== 'DISPONIVEL') throw new ConflictException('Animal não está disponível');
    const application: Application = {
      id: randomUUID(),
      animalId,
      adopterId: user.id,
      reason: data.reason ?? '',
      status: 'PENDENTE',
    };
    try {
      await client.query(
        'INSERT INTO applications(id,animal_id,adopter_id,reason,status) VALUES($1,$2,$3,$4,$5)',
        [application.id, animalId, user.id, application.reason, application.status],
      );
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
        throw new ConflictException('Você já possui uma solicitação pendente para este animal');
      throw error;
    }
    return application;
  }

  async mine(user: PublicUser): Promise<Application[]> {
    const ownerFilter = user.role === 'ADOTANTE' ? 'a.adopter_id=$1' : 'pet.ong_id=$1';
    const result = await this.database.query<Application>(
      `SELECT a.id,a.animal_id AS "animalId",a.adopter_id AS "adopterId",a.reason,a.status FROM applications a JOIN animals pet ON pet.id=a.animal_id WHERE ${ownerFilter} ORDER BY a.created_at`,
      [user.id],
    );
    return result.rows;
  }

  async decide(user: PublicUser, id: string, approve: boolean): Promise<Application> {
    const result = await this.database.transaction(async (client) => {
      const initial = await client.query<{ animal_id: string }>(
        'SELECT animal_id FROM applications WHERE id=$1',
        [id],
      );
      if (!initial.rows[0]) throw new NotFoundException('Solicitação não encontrada');
      // Todas as decisões para o mesmo animal são serializadas pela trava da linha do animal.
      const animalResult = await client.query<{ id: string; ong_id: string; status: string }>(
        'SELECT id,ong_id,status FROM animals WHERE id=$1 FOR UPDATE',
        [initial.rows[0].animal_id],
      );
      const animal = animalResult.rows[0];
      const applicationResult = await client.query<Application>(
        'SELECT id,animal_id AS "animalId",adopter_id AS "adopterId",reason,status FROM applications WHERE id=$1 FOR UPDATE',
        [id],
      );
      const application = applicationResult.rows[0];
      if (!animal || !application) throw new NotFoundException('Solicitação não encontrada');
      if ((user.role !== 'ONG' && user.role !== 'ADMIN') || animal.ong_id !== user.id)
        throw new ForbiddenException('Você não é responsável por este animal');
      if (application.status !== 'PENDENTE')
        throw new ConflictException('Solicitação já foi analisada');
      if (approve && animal.status !== 'DISPONIVEL')
        throw new ConflictException('Animal não está disponível');
      application.status = approve ? 'APROVADA' : 'RECUSADA';
      await client.query('UPDATE applications SET status=$1 WHERE id=$2', [application.status, id]);
      if (approve) {
        await client.query("UPDATE animals SET status='ADOTADO' WHERE id=$1", [animal.id]);
        await client.query(
          "UPDATE applications SET status='RECUSADA' WHERE animal_id=$1 AND id<>$2 AND status='PENDENTE'",
          [animal.id, id],
        );
      }
      return application;
    });
    logJson('info', 'adoption.application_decided', {
      actorId: user.id,
      applicationId: result.id,
      decision: result.status,
    });
    return result;
  }
}
