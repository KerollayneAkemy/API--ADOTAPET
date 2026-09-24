import { isUUID } from 'class-validator';
import { Animal, Application, User } from '../../domain/entities';

export interface StoreSnapshot {
  version: number;
  users: User[];
  animals: Animal[];
  applications: Application[];
}

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringFields = (value: RecordValue, fields: string[]) =>
  fields.every((field) => typeof value[field] === 'string');
const uuid = (value: unknown): value is string => typeof value === 'string' && isUUID(value);

/** Rejeita arquivos inválidos em vez de apagar ou recriar os dados existentes. */
export function validateSnapshot(value: unknown): asserts value is StoreSnapshot {
  const invalid = () => {
    throw new Error(
      'Arquivo de dados inválido. Corrija ou restaure um backup antes de iniciar a API.',
    );
  };
  if (!object(value) || value.version !== 1) return invalid();
  const { users, animals, applications } = value;
  if (!Array.isArray(users) || !Array.isArray(animals) || !Array.isArray(applications))
    return invalid();
  for (const user of users) {
    if (
      !object(user) ||
      !uuid(user.id) ||
      !stringFields(user, ['name', 'email', 'passwordHash']) ||
      !['ONG', 'ADMIN', 'ADOTANTE'].includes(String(user.role)) ||
      !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(String(user.passwordHash))
    )
      return invalid();
  }
  const userMap = new Map(users.map((user) => [user.id, user]));
  if (
    userMap.size !== users.length ||
    new Set(users.map((user) => user.email)).size !== users.length
  )
    return invalid();
  for (const animal of animals) {
    if (
      !object(animal) ||
      !uuid(animal.id) ||
      !uuid(animal.ongId) ||
      !stringFields(animal, [
        'name',
        'species',
        'breed',
        'sex',
        'size',
        'city',
        'state',
        'description',
      ]) ||
      typeof animal.age !== 'number' ||
      !Number.isInteger(animal.age) ||
      animal.age < 0 ||
      !['DISPONIVEL', 'ADOTADO'].includes(String(animal.status)) ||
      !['ONG', 'ADMIN'].includes(userMap.get(animal.ongId)?.role)
    )
      return invalid();
  }
  const animalMap = new Map(animals.map((animal) => [animal.id, animal]));
  if (animalMap.size !== animals.length) return invalid();
  const approved = new Set<string>();
  const pending = new Set<string>();
  for (const application of applications) {
    if (
      !object(application) ||
      !uuid(application.id) ||
      !uuid(application.animalId) ||
      !uuid(application.adopterId) ||
      typeof application.reason !== 'string' ||
      !['PENDENTE', 'APROVADA', 'RECUSADA'].includes(String(application.status)) ||
      userMap.get(application.adopterId)?.role !== 'ADOTANTE' ||
      !animalMap.has(application.animalId)
    )
      return invalid();
    if (application.status === 'APROVADA') {
      if (
        approved.has(application.animalId) ||
        animalMap.get(application.animalId)?.status !== 'ADOTADO'
      )
        return invalid();
      approved.add(application.animalId);
    }
    if (application.status === 'PENDENTE') {
      const key = application.animalId + ':' + application.adopterId;
      if (pending.has(key) || animalMap.get(application.animalId)?.status !== 'DISPONIVEL')
        return invalid();
      pending.add(key);
    }
  }
  if (new Set(applications.map((application) => application.id)).size !== applications.length)
    return invalid();
  for (const animal of animals)
    if (animal.status === 'ADOTADO' && !approved.has(animal.id)) return invalid();
}
