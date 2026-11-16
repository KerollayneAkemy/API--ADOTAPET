import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const userExample = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Adotante Exemplo',
  email: 'adotante@adotapet.local',
  role: 'ADOTANTE',
};
export const animalExample = {
  id: '22222222-2222-4222-8222-222222222222',
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
  ongId: '33333333-3333-4333-8333-333333333333',
  photos: [],
};
export const applicationExample = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: animalExample.id,
  adopterId: userExample.id,
  reason: 'Quero oferecer um lar seguro e carinhoso.',
  status: 'PENDENTE',
};
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const text: SchemaObject = { type: 'string' };
export const userSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'email', 'role'],
  properties: {
    id: uuid,
    name: text,
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['ADMIN', 'ONG', 'ADOTANTE'] },
  },
};
export const animalSchema: SchemaObject = {
  type: 'object',
  required: Object.keys(animalExample),
  properties: {
    id: uuid,
    name: text,
    species: text,
    breed: text,
    sex: text,
    size: text,
    city: text,
    state: { type: 'string', minLength: 2, maxLength: 2 },
    age: { type: 'integer', minimum: 0 },
    description: text,
    status: { type: 'string', enum: ['DISPONIVEL', 'ADOTADO'] },
    ongId: uuid,
    photos: { type: 'array', items: { type: 'string', format: 'uri' } },
  },
};
export const applicationSchema: SchemaObject = {
  type: 'object',
  required: Object.keys(applicationExample),
  properties: {
    id: uuid,
    animalId: uuid,
    adopterId: uuid,
    reason: text,
    status: { type: 'string', enum: ['PENDENTE', 'APROVADA', 'RECUSADA'] },
  },
};
const errorNames: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  503: 'Service Unavailable',
};

/** Documenta o contrato existente sem modificar a execução da rota. */
export function ApiEndpoint(
  summary: string,
  description: string,
  status: number,
  schema: SchemaObject,
  example: unknown,
  errors: Record<number, string> = {},
) {
  return applyDecorators(
    ApiOperation({ summary, description }),
    ApiResponse({
      status,
      description:
        status === 201
          ? 'Operação realizada com sucesso.'
          : 'Consulta ou atualização realizada com sucesso.',
      content: { 'application/json': { schema, example } },
    }),
    ...Object.entries({ ...errors, 429: errors[429] ?? 'Limite de requisições excedido.' }).map(
      ([code, message]) => {
        const statusCode = Number(code);
        return ApiResponse({
          status: statusCode,
          description: message,
          content: {
            'application/problem+json': {
              schema: {
                type: 'object',
                required: ['type', 'title', 'status', 'detail', 'instance', 'requestId'],
                properties: {
                  type: { type: 'string', example: 'about:blank' },
                  title: { type: 'string' },
                  status: { type: 'integer' },
                  detail: { type: 'string' },
                  instance: { type: 'string' },
                  requestId: { type: 'string' },
                  errors: { type: 'array', items: { type: 'string' } },
                },
              },
              example: {
                type: 'about:blank',
                title: errorNames[statusCode] ?? 'Error',
                status: statusCode,
                detail: message,
                instance: '/api/example',
                requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              },
            },
          },
        });
      },
    ),
  );
}
