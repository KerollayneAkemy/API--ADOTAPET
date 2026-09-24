export type Role = 'ADMIN' | 'ONG' | 'ADOTANTE';
export type AnimalStatus = 'DISPONIVEL' | 'ADOTADO';
export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}
export type PublicUser = Omit<User, 'passwordHash'>;
export interface Animal {
  id: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  size: string;
  city: string;
  state: string;
  age: number;
  description: string;
  status: AnimalStatus;
  ongId: string;
}
export interface Application {
  id: string;
  animalId: string;
  adopterId: string;
  reason: string;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
}
