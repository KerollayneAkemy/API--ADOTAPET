# AdotaPet API

API REST para conectar pessoas interessadas em adoção a organizações responsáveis por animais. O projeto oferece cadastro e autenticação, publicação de animais, solicitações de adoção, análise dos pedidos e armazenamento privado de fotos.

> **Autoria:** KerollayneAkemy, Emily2311 e AnaLuiza2431.

## Sumário

- [Visão geral](#visão-geral)
- [Tecnologias e arquitetura](#tecnologias-e-arquitetura)
- [Funcionalidades](#funcionalidades)
- [Executar localmente](#executar-localmente)
- [Configuração](#configuração)
- [API e documentação interativa](#api-e-documentação-interativa)
- [Testes e verificações](#testes-e-verificações)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Implantação](#implantação)

## Visão geral

O AdotaPet é um backend desenvolvido com NestJS e TypeScript. A API usa PostgreSQL para persistir os dados, Redis para limitar requisições e Cloudflare R2 para armazenar fotos em um bucket privado. A aplicação pode ser executada localmente por Docker Compose; hospedagem em VPS/Coolify é opcional.

## Tecnologias e arquitetura

| Área                  | Tecnologia                           | Responsabilidade                                                      |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| API                   | NestJS, TypeScript e Express         | Rotas HTTP, validação e organização por módulos                       |
| Persistência          | PostgreSQL                           | Usuários, animais, solicitações, idempotência e controle de migrações |
| Limite de requisições | Redis                                | Contadores compartilhados entre instâncias da API                     |
| Fotos                 | Cloudflare R2, API compatível com S3 | Armazenamento privado e URLs temporárias de leitura                   |
| Documentação          | Swagger / OpenAPI                    | Exploração e execução das rotas da API                                |
| Ambiente local        | Docker Compose                       | Inicialização da API e dos serviços dependentes                       |

O código separa controladores e DTOs (camada HTTP), serviços (regras de negócio), entidades de domínio e infraestrutura (banco, Redis, R2 e observabilidade). O PostgreSQL é o armazenamento principal. O importador JSON existe apenas para migração opcional de dados antigos.

## Funcionalidades

### Contas e permissões

- Cadastro público de perfis `ONG` e `ADOTANTE`; não há cadastro público de `ADMIN`.
- Senhas armazenadas com hash `scrypt` e salt individual.
- Autenticação por JWT HS256, com expiração de 24 horas.
- A ONG responsável pelo animal pode analisar as solicitações. Um usuário `ADMIN` também precisa ser o responsável pelo animal para aprovar ou recusar pedidos.

### Animais e adoções

- Listagem pública de animais, com filtros opcionais por espécie, cidade e status.
- Cadastro de animais por ONG ou administrador autorizado.
- Solicitação de adoção por adotantes para animais disponíveis.
- Bloqueio de solicitações pendentes duplicadas do mesmo adotante para o mesmo animal.
- Aprovação transacional: marca o animal como adotado e recusa as outras solicitações pendentes.
- Operações concorrentes são coordenadas com travas no PostgreSQL.

### Idempotência

As rotas abaixo exigem o cabeçalho `Idempotency-Key`, com chave de 8 a 128 caracteres:

| Método e rota                               | Operação              |
| ------------------------------------------- | --------------------- |
| `POST /api/auth/register`                   | Cadastro de usuário   |
| `POST /api/animals`                         | Cadastro de animal    |
| `POST /api/animals/{id}/photos`             | Upload de foto        |
| `POST /api/animals/{animalId}/applications` | Solicitação de adoção |

Os registros são mantidos no PostgreSQL por 24 horas. Repetir a mesma chave com os mesmos dados retorna a resposta armazenada; usar a chave com dados diferentes retorna `409 Conflict`. O PostgreSQL serializa operações simultâneas com a mesma chave e escopo.

### Fotos privadas

O upload aceita imagens JPEG, PNG e WebP de até 8 MiB e exige autenticação, permissão do responsável e `Idempotency-Key`. As fotos são associadas ao animal no banco. O bucket R2 não precisa ser público: a rota `GET /api/animals/{id}/photos/{photoId}` fornece acesso por URL assinada com validade de 15 minutos.

### Observabilidade e proteção

- Erros seguem RFC 7807, com `Content-Type: application/problem+json` e `requestId`.
- Logs estruturados em JSON registram eventos e identificador de requisição, sem incluir senhas, tokens ou credenciais.
- O Request-ID recebido ou gerado é propagado pela aplicação.
- O Redis aplica limite de requisições. Se o Redis estiver indisponível, a API falha de forma fechada e retorna indisponibilidade em vez de ignorar o limite.
- `GET /api/health` verifica a disponibilidade do processo da API; não é uma verificação completa da saúde de PostgreSQL, Redis ou R2.

## Executar localmente

### Pré-requisitos

- Docker Desktop instalado e em execução.
- Docker Compose disponível (`docker compose version`).
- Git, caso vá clonar o repositório.

### Inicialização

1. Clone o repositório e entre na pasta do projeto.
2. Copie `.env.example` para `.env`.
3. Gere segredos próprios para `POSTGRES_PASSWORD` e `JWT_SECRET`; não use os valores de exemplo. O segredo JWT deve ter pelo menos 32 bytes. Por exemplo:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

4. Inicie os serviços:

   ```bash
   docker compose up --build -d
   ```

5. Acompanhe a inicialização da API:

   ```bash
   docker compose ps
   docker compose logs -f api
   ```

6. Abra a documentação em <http://localhost:3000/docs>.

Na inicialização, a API aguarda PostgreSQL e Redis ficarem saudáveis e aplica as migrações SQL pendentes antes de receber tráfego. Os volumes nomeados `postgres_data` e `redis_data` preservam dados ao recriar ou reiniciar containers. Para parar os serviços mantendo os dados, use `docker compose down`. **Não use `docker compose down -v` se precisar preservar os volumes.**

### Variáveis de ambiente

Configure os valores no arquivo local `.env` ou no gerenciador de segredos do ambiente de hospedagem. Não comite credenciais reais.

| Variável               | Obrigatória             | Descrição                                              |
| ---------------------- | ----------------------- | ------------------------------------------------------ |
| `POSTGRES_DB`          | Não                     | Banco local; padrão `adotapet`                         |
| `POSTGRES_USER`        | Não                     | Usuário local; padrão `adotapet`                       |
| `POSTGRES_PASSWORD`    | Sim                     | Senha do PostgreSQL; escolha um valor forte            |
| `JWT_SECRET`           | Sim                     | Segredo de assinatura JWT, com pelo menos 32 bytes     |
| `JWT_ISSUER`           | Não                     | Emissor dos tokens; padrão `adotapet-api`              |
| `JWT_AUDIENCE`         | Não                     | Público dos tokens; padrão `adotapet-client`           |
| `API_PORT`             | Não                     | Porta local publicada; padrão `3000`                   |
| `RATE_LIMIT_MAX`       | Não                     | Requisições permitidas por janela; padrão `100`        |
| `RATE_LIMIT_WINDOW_MS` | Não                     | Duração da janela em milissegundos; padrão `60000`     |
| `SEED_DEMO_DATA`       | Não                     | Ativa dados de demonstração; padrão `false`            |
| `DEMO_SEED_PASSWORD`   | Se o seed estiver ativo | Senha dos usuários de demonstração; mínimo de 12 bytes |
| `R2_ACCOUNT_ID`        | Não                     | ID da conta Cloudflare; necessário para habilitar o R2 |
| `R2_ACCESS_KEY_ID`     | Não                     | Access Key do token R2 com escopo mínimo               |
| `R2_SECRET_ACCESS_KEY` | Não                     | Secret Access Key do token R2                          |
| `R2_BUCKET`            | Não                     | Nome do bucket privado de fotos                        |

As quatro variáveis `R2_*` devem ser configuradas em conjunto. Se estiverem vazias, a API inicia sem upload e as rotas de fotos retornam indisponibilidade. O bucket não deve ser configurado como público.

## API e documentação interativa

Com a API em execução:

- Swagger interativo: <http://localhost:3000/docs>
- Documento OpenAPI: <http://localhost:3000/docs-json>
- Health check: <http://localhost:3000/api/health>

Para testar rotas protegidas, use `POST /api/auth/login` e informe o `accessToken` em **Authorize** no Swagger. Nas rotas críticas de criação, informe também uma chave `Idempotency-Key` nova para cada operação diferente. O Swagger apresenta exemplos ilustrativos; use IDs e credenciais criados no seu ambiente.

## Testes e verificações

Instale as dependências e execute as verificações locais:

```bash
npm ci
npm run typecheck
npm run format:check
npm run build
npm test
```

Os testes de integração usam containers e banco isolados, sem compartilhar os volumes do ambiente de desenvolvimento:

```bash
docker compose --profile test run --build --rm integration-tests
```

A suíte end-to-end exige PostgreSQL e Redis configurados por `DATABASE_URL` e `REDIS_URL`. Use somente um banco descartável de testes ao executá-la diretamente no host:

```bash
npm run test:e2e
```

Testes automatizados de R2 usam simulações. A validação com Cloudflare real depende de credenciais configuradas e de arquivos de teste; não é feita automaticamente pela suíte padrão.

## Estrutura do projeto

```text
src/
├── common/          # Segurança, validação, documentação e observabilidade compartilhadas
├── domain/          # Tipos e entidades do domínio
├── infrastructure/  # PostgreSQL, idempotência, Redis e Cloudflare R2
├── modules/         # Módulos de autenticação, animais, adoções e saúde
├── app.module.ts    # Composição dos módulos da aplicação
├── main.ts          # Inicialização do servidor
└── setup-app.ts     # Configuração HTTP, validação global e Swagger
migrations/          # Migrações SQL aplicadas pela API na inicialização
scripts/             # Utilitários de manutenção e importação de dados
test/                # Testes unitários e de integração
docs/arquitetura/    # Diagramas da arquitetura e do modelo relacional
```

## Implantação

VPS e Coolify são opções de hospedagem, não requisitos para desenvolver ou avaliar o projeto. Uma implantação deve fornecer Docker, PostgreSQL e Redis acessíveis pela API e configurar os segredos no ambiente de hospedagem. O R2 é opcional e só é necessário para habilitar uploads reais. O projeto não inclui provisionamento automático de uma VPS.

## Autoria

Desenvolvido por **KerollayneAkemy**, **Emily2311** e **AnaLuiza2431**.
