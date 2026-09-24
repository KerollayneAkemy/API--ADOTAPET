import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AnimalsService } from '../../animals/services/animals.service';
import { Application, PublicUser } from '../../../domain/entities';
import { CreateApplicationDto } from '../dto/create-application.dto';
import { StoreService } from '../../../infrastructure/persistence/store.service';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly store: StoreService,
    private readonly animals: AnimalsService,
  ) {}

  create(user: PublicUser, animalId: string, data: CreateApplicationDto): Application {
    if (user.role !== 'ADOTANTE')
      throw new ForbiddenException('Apenas adotante pode solicitar adoção');
    const animal = this.animals.get(animalId);
    if (animal.status !== 'DISPONIVEL') throw new ConflictException('Animal não está disponível');
    const duplicate = [...this.store.applications.values()].some(
      (application) =>
        application.animalId === animalId &&
        application.adopterId === user.id &&
        application.status === 'PENDENTE',
    );
    if (duplicate)
      throw new ConflictException('Você já possui uma solicitação pendente para este animal');
    const application: Application = {
      id: randomUUID(),
      animalId,
      adopterId: user.id,
      reason: data.reason ?? '',
      status: 'PENDENTE',
    };
    this.store.commit(() => this.store.applications.set(application.id, application));
    return application;
  }

  mine(user: PublicUser): Application[] {
    return [...this.store.applications.values()].filter((application) =>
      user.role === 'ADOTANTE'
        ? application.adopterId === user.id
        : this.store.animals.get(application.animalId)?.ongId === user.id,
    );
  }

  decide(user: PublicUser, id: string, approve: boolean): Application {
    const application = this.store.applications.get(id);
    if (!application) throw new NotFoundException('Solicitação não encontrada');
    const animal = this.animals.get(application.animalId);
    if ((user.role !== 'ONG' && user.role !== 'ADMIN') || animal.ongId !== user.id) {
      throw new ForbiddenException('Você não é responsável por este animal');
    }
    if (application.status !== 'PENDENTE')
      throw new ConflictException('Solicitação já foi analisada');
    if (approve && animal.status !== 'DISPONIVEL')
      throw new ConflictException('Animal não está disponível');
    return this.store.commit(() => {
      application.status = approve ? 'APROVADA' : 'RECUSADA';
      if (approve) {
        animal.status = 'ADOTADO';
        for (const other of this.store.applications.values()) {
          if (other.animalId === animal.id && other.status === 'PENDENTE')
            other.status = 'RECUSADA';
        }
      }
      return application;
    });
  }
}
