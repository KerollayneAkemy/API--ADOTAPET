import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Animal, PublicUser } from '../../../domain/entities';
import { CreateAnimalDto } from '../dto/create-animal.dto';
import { ListAnimalsDto } from '../dto/list-animals.dto';
import { StoreService } from '../../../infrastructure/persistence/store.service';

@Injectable()
export class AnimalsService {
  constructor(private readonly store: StoreService) {}

  list(filters: ListAnimalsDto): Animal[] {
    return [...this.store.animals.values()].filter(
      (animal) =>
        (!filters.species || animal.species === filters.species) &&
        (!filters.city || animal.city.toLowerCase() === filters.city.toLowerCase()) &&
        (!filters.status || animal.status === filters.status),
    );
  }

  get(id: string): Animal {
    const animal = this.store.animals.get(id);
    if (!animal) throw new NotFoundException('Animal não encontrado');
    return animal;
  }

  create(user: PublicUser, data: CreateAnimalDto): Animal {
    if (user.role !== 'ONG' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas ONG ou administrador pode cadastrar animais');
    }
    const animal: Animal = {
      name: data.name,
      species: data.species,
      breed: data.breed,
      sex: data.sex,
      size: data.size,
      city: data.city,
      state: data.state,
      age: data.age,
      description: data.description,
      id: randomUUID(),
      status: 'DISPONIVEL',
      ongId: user.id,
    };
    this.store.commit(() => this.store.animals.set(animal.id, animal));
    return animal;
  }
}
