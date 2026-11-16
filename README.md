# AdotaPet API

API REST NestJS para adoção de animais. Controllers e DTOs tratam HTTP e validação; serviços concentram regras; infraestrutura gerencia PostgreSQL, Redis e Cloudflare R2.

## Implementado

- PostgreSQL com migrações SQL aplicadas na inicialização, chaves estrangeiras, restrições e volumes persistentes. JSON só é aceito pelo importador legado opcional.
- Cadastro com senha hash, JWT HS256 com expiração de 24 horas e autorização por perfil e responsabilidade. ADMIN também precisa ser responsável pelo animal.
- Fluxo de adoção transacional: bloqueio de linha do animal, unicidade de pedido pendente e aprovação única.
- `Idempotency-Key` obrigatório em `POST /api/auth/register`, `POST /api/animals`, `POST /api/animals/{id}/photos` e `POST /api/animals/{animalId}/applications`. Chaves são duráveis por 24 horas, repetição de conteúdo devolve o mesmo corpo e conteúdo diferente resulta em 409. Chaves simultâneas são serializadas no PostgreSQL.
- Erros HTTP em RFC 7807 (`application/problem+json`), incluindo `requestId`; Request-ID aceito/gerado, propagado por AsyncLocalStorage e emitido em logs JSON estruturados. Logs não registram corpos, parâmetros SQL, senhas ou tokens.
- Rate limiting distribuído no Redis com falha fechada se o Redis estiver indisponível.
- Upload privado ao R2 para JPEG/PNG/WebP até 8 MiB. O acesso é feito por `/api/animals/{id}/photos/{photoId}`, que redireciona a URL assinada de 15 minutos. Não exige bucket público.
- Swagger interativo em `/docs`, OpenAPI em `/docs-json`, saúde em `/api/health`.

Cadastro público aceita somente ONG e ADOTANTE. ADMIN pode ser criado por seed/importação administrativa; não há endpoint público para promover usuário.

O seed de demonstração é opcional e somente para desenvolvimento: defina `SEED_DEMO_DATA=true` e `DEMO_SEED_PASSWORD` com uma senha forte (mínimo de 12 bytes). A API recusa esse seed quando `NODE_ENV=production`; não existem senhas padrão ou contas de demonstração criadas automaticamente.

## Requisitos e início local

Requer Docker Desktop com Docker Compose. Copie `.env.example` para `.env`; preencha `POSTGRES_PASSWORD` e `JWT_SECRET` com valores fortes diferentes (JWT com ao menos 32 bytes). Não use os exemplos vazios ou palavras de placeholder. Gere um segredo com:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Inicie os serviços:

```bash
docker compose up --build -d
docker compose logs -f api
```

A API aguarda PostgreSQL/Redis saudáveis e aplica `migrations/*.sql` antes de aceitar tráfego. Os volumes nomeados `postgres_data` e `redis_data` preservam dados em recriações e reinícios. Para parar sem remover volumes: `docker compose down`. Não use `down -v` se quiser conservar dados.

Abra `http://localhost:3000/docs`. Configure o bucket R2 privado por variáveis de ambiente para habilitar upload. Sem essas variáveis, a API inicia normalmente e responde 503 às operações de upload/acesso.

### Demonstração pública temporária pela Cloudflare (opcional)

Sem domínio, é possível expor a API local com Quick Tunnel. Isso não hospeda a API na Cloudflare: API, PostgreSQL e Redis continuam neste computador, que precisa permanecer ligado e conectado. O endereço `trycloudflare.com` é temporário e muda quando o Tunnel é reiniciado. Enquanto estiver ativo, qualquer pessoa com o endereço pode acessar as rotas públicas da API.

Inicie a API, os bancos e o Tunnel:

```bash
docker compose --profile demo-tunnel up --build -d
docker compose logs -f cloudflared
```

Copie a URL `trycloudflare.com` exibida nos logs e teste `/api/health`. Para encerrar somente o acesso público, execute `docker compose stop cloudflared`; API, bancos e volumes continuam ativos.

### Importação do JSON antigo (opcional)

Mantenha o arquivo original. Após iniciar a API e aplicar migrações, aponte `DATABASE_URL` para o PostgreSQL local e importe:

```bash
npm ci
npm run import:json -- data/adotapet.json
```

O importador roda transacionalmente e pode ser repetido. JSON não é armazenamento da aplicação atual.

## R2 privado

Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET` no `.env`, com credenciais de escopo mínimo. Não configure leitura pública; o código usa URLs assinadas temporárias. `POST /api/animals/{id}/photos` exige JWT do responsável e `Idempotency-Key`; envie multipart com campo `photo`. Credenciais R2 reais não são necessárias para testes automatizados, que usam mocks.

## Testes

Testes unitários (não dependem de serviços externos):

```bash
npm ci
npm test
npm run typecheck
npm run format:check
npm run build
```

Integração com PostgreSQL e Redis reais, em instâncias isoladas do ambiente normal:

```bash
docker compose --profile test run --build --rm integration-tests
```

O perfil cria containers sem volume persistente e usa banco de teste dedicado. A suíte e2e falha explicitamente se executada sem `DATABASE_URL`; ela não é considerada aprovada quando não executada. Para executar no host, configure `DATABASE_URL`, `REDIS_URL` e um banco descartável antes de `npm run test:e2e`.

## VPS (opcional)

O projeto exige execução em Docker Compose; hospedagem em VPS, proxy HTTPS, backups externos e monitoração são propostas operacionais opcionais. Não são necessárias para rodar ou avaliar a aplicação localmente.

## Diagramas

Diagramas editáveis em `docs/arquitetura/diagramas/` representam a implementação atual. A camada de transporte HTTP usa JSON; persistência é PostgreSQL. Redis aplica rate limit e o R2 privado armazena imagens.
