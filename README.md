# 🐾 AdotaPet API

**Backend para conectar organizações de proteção animal e pessoas interessadas em adoção.**

A API reúne cadastro de animais, solicitações de adoção e gerenciamento de fotos, com autenticação e persistência em PostgreSQL.

| 📚 Documentação   | 💚 Saúde da API | 🧱 Execução local |
| ----------------- | --------------- | ----------------- |
| `/docs` (Swagger) | `/api/health`   | Docker Compose    |

## 📍 Sobre o projeto

O AdotaPet é uma API REST construída com NestJS e TypeScript. PostgreSQL armazena os dados da aplicação, Redis controla o limite de requisições e Cloudflare R2 guarda fotos em um bucket privado. O R2 é opcional para executar a API; sem ele, as operações de foto ficam indisponíveis.

### ✨ Principais recursos

- Cadastro e login com senha protegida por hash e autenticação JWT.
- Perfis `ONG`, `ADOTANTE` e `ADMIN`, com autorização baseada no responsável pelo animal.
- Cadastro, listagem, filtros e consulta de animais.
- Solicitações de adoção com aprovação e recusa transacionais.
- Chaves de idempotência para evitar duplicação em operações críticas.
- Upload de fotos privadas no Cloudflare R2.
- Logs estruturados, Request-ID e erros no formato Problem Details.

## 🧰 Tecnologias

| Componente            | Tecnologia                        | Uso                                                |
| --------------------- | --------------------------------- | -------------------------------------------------- |
| API                   | NestJS, TypeScript e Express      | Rotas HTTP, validação e regras de negócio          |
| Banco de dados        | PostgreSQL                        | Persistência e migrações SQL                       |
| Limite de requisições | Redis                             | Contadores compartilhados entre instâncias         |
| Imagens               | Cloudflare R2 (compatível com S3) | Armazenamento privado e URLs temporárias           |
| Documentação          | Swagger / OpenAPI                 | Consulta e execução interativa das rotas           |
| Ambiente local        | Docker Compose                    | API e serviços necessários para executar o projeto |

## 🏗️ Organização da aplicação

O código está separado por responsabilidades: controladores e DTOs recebem e validam requisições; serviços executam as regras; a camada de infraestrutura integra PostgreSQL, Redis e R2. Migrações SQL são aplicadas pela API durante a inicialização.

```text
src/
├── common/           # Segurança, validação, Swagger e observabilidade
├── domain/            # Tipos e entidades do domínio
├── infrastructure/   # PostgreSQL, idempotência, Redis e R2
├── modules/           # Autenticação, animais, adoções e saúde
├── app.module.ts      # Composição dos módulos NestJS
├── main.ts            # Inicialização do servidor
└── setup-app.ts       # Configurações HTTP e Swagger
migrations/            # Migrações SQL
scripts/               # Utilitários, incluindo importação legada de JSON
test/                  # Testes automatizados
docs/arquitetura/      # Diagramas da arquitetura e do banco
```

## 🔐 Regras de acesso e adoção

- O cadastro público aceita `ONG` e `ADOTANTE`. Não existe rota pública para criar `ADMIN`.
- Uma ONG pode gerenciar os animais sob sua responsabilidade. O perfil `ADMIN` também precisa ser responsável pelo animal para aprovar ou recusar solicitações.
- Somente adotantes podem solicitar adoção de animais disponíveis.
- Um adotante não pode manter dois pedidos pendentes para o mesmo animal.
- Ao aprovar um pedido, a API marca o animal como adotado e recusa os outros pedidos pendentes.
- Transações e travas no PostgreSQL protegem decisões simultâneas sobre o mesmo animal.

### ♻️ Idempotência

As rotas críticas abaixo exigem `Idempotency-Key` com 8 a 128 caracteres:

| Método | Rota                                   | Ação              |
| ------ | -------------------------------------- | ----------------- |
| `POST` | `/api/auth/register`                   | Cadastrar usuário |
| `POST` | `/api/animals`                         | Cadastrar animal  |
| `POST` | `/api/animals/{id}/photos`             | Enviar foto       |
| `POST` | `/api/animals/{animalId}/applications` | Solicitar adoção  |

As chaves e respostas são salvas no PostgreSQL por 24 horas. Repetir uma chave com os mesmos dados retorna a resposta original; reutilizá-la com dados diferentes resulta em `409 Conflict`. Requisições simultâneas com a mesma chave são serializadas no banco.

## 🖼️ Fotos dos animais

O upload aceita JPEG, PNG ou WebP de até 8 MiB. É necessário autenticar como responsável pelo animal e informar `Idempotency-Key`. O bucket não precisa ser público: a rota `GET /api/animals/{id}/photos/{photoId}` fornece acesso por uma URL assinada temporária, válida por 15 minutos.

Para habilitar o R2, configure as quatro variáveis `R2_*` descritas na tabela de configuração abaixo. Elas devem ser configuradas em conjunto. Credenciais reais devem ficar apenas no ambiente local ou no gerenciador de segredos da hospedagem.

## ⚙️ Configuração e execução local

### Pré-requisitos

- Docker Desktop instalado e em execução.
- Docker Compose (`docker compose version`).
- Git para clonar o repositório.

### 1. Obter o projeto

```bash
git clone https://github.com/KerollayneAkemy/API--ADOTAPET.git
cd API--ADOTAPET
```

### 2. Criar o arquivo de ambiente

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e preencha `POSTGRES_PASSWORD` e `JWT_SECRET` com valores fortes e diferentes. O segredo JWT deve ter no mínimo 32 bytes. Para gerar um valor aleatório:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Não use senhas de exemplo, não compartilhe segredos e não envie o arquivo `.env` ao Git.

### 3. Iniciar os serviços

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

Quando a API estiver saudável, abra <http://localhost:3000/docs>.

O Compose inicia a API, PostgreSQL e Redis. A API aguarda os serviços ficarem saudáveis e aplica as migrações pendentes. Os volumes `postgres_data` e `redis_data` preservam os dados após reinicializações. Para parar os containers sem remover os dados, execute `docker compose down`. **Evite `docker compose down -v`: esse comando apaga os volumes.**

### ⚙️ Variáveis de ambiente

| Variável               | Necessária    | Descrição                                             |
| ---------------------- | ------------- | ----------------------------------------------------- |
| `POSTGRES_DB`          | Não           | Banco local; padrão `adotapet`                        |
| `POSTGRES_USER`        | Não           | Usuário local; padrão `adotapet`                      |
| `POSTGRES_PASSWORD`    | **Sim**       | Senha forte para o PostgreSQL                         |
| `JWT_SECRET`           | **Sim**       | Segredo de assinatura JWT, mínimo de 32 bytes         |
| `JWT_ISSUER`           | Não           | Emissor JWT; padrão `adotapet-api`                    |
| `JWT_AUDIENCE`         | Não           | Público JWT; padrão `adotapet-client`                 |
| `API_PORT`             | Não           | Porta publicada no computador; padrão `3000`          |
| `RATE_LIMIT_MAX`       | Não           | Requisições permitidas por janela; padrão `100`       |
| `RATE_LIMIT_WINDOW_MS` | Não           | Janela do limite em milissegundos; padrão `60000`     |
| `SEED_DEMO_DATA`       | Não           | Insere dados de demonstração; padrão `false`          |
| `DEMO_SEED_PASSWORD`   | Se seed ativo | Senha para contas de demonstração; mínimo de 12 bytes |
| `R2_ACCOUNT_ID`        | Para usar R2  | ID da conta Cloudflare                                |
| `R2_ACCESS_KEY_ID`     | Para usar R2  | Access Key do token R2                                |
| `R2_SECRET_ACCESS_KEY` | Para usar R2  | Secret Access Key do token R2                         |
| `R2_BUCKET`            | Para usar R2  | Nome do bucket privado                                |

> Se as variáveis de R2 estiverem vazias, a API inicia sem fotos. Se apenas parte delas estiver configurada, a validação da aplicação impede a inicialização.

O seed é opcional e destinado somente a desenvolvimento. Quando ativado, exige `DEMO_SEED_PASSWORD` e não pode ser usado com `NODE_ENV=production`. Nenhuma conta de demonstração ou senha padrão é criada automaticamente.

## 🧭 Rotas e Swagger

| Recurso            | Endereço local                     |
| ------------------ | ---------------------------------- |
| Swagger interativo | <http://localhost:3000/docs>       |
| Documento OpenAPI  | <http://localhost:3000/docs-json>  |
| Health check       | <http://localhost:3000/api/health> |

Para usar rotas protegidas, faça login em `POST /api/auth/login` e cole o `accessToken` em **Authorize** no Swagger. Os exemplos da documentação são ilustrativos; use IDs e contas criados no seu ambiente.

### 🧪 Teste rápido do health check

```bash
curl http://localhost:3000/api/health
```

A resposta indica que o processo da API está ativo. Esse endpoint não verifica PostgreSQL, Redis ou R2.

## 🛡️ Observabilidade

- Exceções HTTP são retornadas em RFC 7807 com o tipo `application/problem+json` e um `requestId`.
- Logs estruturados em JSON incluem eventos, duração e Request-ID, sem registrar senhas, tokens ou credenciais.
- O Request-ID enviado pelo cliente é propagado; se não existir ou for inválido, a API gera um identificador.
- O Redis aplica rate limiting. Se ficar indisponível, a API retorna erro temporário em vez de ignorar o limite.

## ✅ Testes e verificações

Instale as dependências e rode as verificações locais:

```bash
npm ci
npm run typecheck
npm run format:check
npm run build
npm test
```

Para testes integrados com PostgreSQL e Redis em containers isolados:

```bash
docker compose --profile test run --build --rm integration-tests
```

A suíte end-to-end executada diretamente no computador exige `DATABASE_URL` e `REDIS_URL` apontando para serviços de teste descartáveis:

```bash
npm run test:e2e
```

> Os testes automatizados do R2 usam simulações. Testar a integração real exige credenciais configuradas e imagens de teste.

## 📦 Importar dados JSON antigos (opcional)

JSON não é o armazenamento atual da aplicação. O importador existe somente para transferir um arquivo antigo para PostgreSQL. Preserve uma cópia do arquivo e configure `DATABASE_URL` para o banco de destino antes de executar:

```bash
npm ci
npm run import:json -- data/adotapet.json
```

## 🚀 Hospedagem

Docker Compose é o ambiente recomendado para desenvolvimento e avaliação. VPS ou Coolify são opções de hospedagem, mas não são obrigatórios. Uma implantação precisa fornecer PostgreSQL e Redis acessíveis à API e guardar as credenciais como variáveis de ambiente. O projeto não provisiona uma VPS automaticamente.

### 🌐 Túnel temporário para demonstração (opcional)

O perfil `demo-tunnel` expõe a API local usando um Quick Tunnel da Cloudflare. Isso não hospeda os serviços na Cloudflare: o computador precisa permanecer ligado e conectado, e o endereço público pode mudar ao reiniciar o túnel. Qualquer pessoa com o endereço pode acessar as rotas públicas da API.

```bash
docker compose --profile demo-tunnel up --build -d
docker compose logs -f cloudflared
```

Para encerrar somente o túnel, mantendo API, banco e Redis ativos:

```bash
docker compose stop cloudflared
```

## 🗺️ Diagramas

Os diagramas editáveis da arquitetura e do domínio estão em [`docs/arquitetura/diagramas/`](docs/arquitetura/diagramas/README.md): C4 (contexto, containers, componentes e implantação), ER, UML de casos de uso, classes, atividade e sequência. Eles descrevem PostgreSQL, Redis e R2 privado de acordo com a implementação atual.

## 👥 Autoria

Desenvolvido por **Kerollayne Akemy** (`@KerollayneAkemy`), **Emily Pereira** (`@Emily2311`) e **Ana Luiza** (`@AnaLuiza2431`).
