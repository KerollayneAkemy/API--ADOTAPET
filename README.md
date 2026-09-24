# AdotaPet API

API NestJS para adoção de animais, com execução local sem Docker e persistência local em arquivo JSON.

## Executar

Requisitos: Node.js 20 ou superior e npm.

```bash
npm ci
npm run start:dev
```

- Swagger: http://localhost:3000/docs
- Prefixo das rotas: `/api` (não existe uma página GET `/api`).
- Saúde: http://localhost:3000/api/health

A porta padrão é 3000. Para alterar no PowerShell:

```powershell
$env:PORT = '3001'
npm run start:dev
```

A aplicação lê `PORT` do ambiente do processo; arquivos `.env` não são carregados automaticamente.

## Verificação

```bash
npm run build
npm run typecheck
npm test -- --runInBand
```

Os testes sobem uma instância isolada em porta livre e verificam as rotas HTTP, validação, autenticação, permissões, adoções e schemas do Swagger. Cada teste começa com dados novos.

O comando `typecheck` verifica tipos, imports e variáveis sem uso. O build limpa `dist` antes de compilar, evitando sobras de arquivos removidos.

## Organização

O código editável fica em `src/`. A pasta `dist/` contém o JavaScript gerado por `npm run build` ou `npm run start:dev`; não edite esses arquivos. `node_modules/` contém as bibliotecas instaladas pelo npm. Essas pastas são geradas localmente e não são enviadas ao GitHub. Preferências pessoais do editor em `.vscode/` também ficam somente no computador de cada integrante.

```text
src/
  common/                 # Decoradores, segurança e contratos Swagger
  domain/                 # Entidades e tipos de negócio
  infrastructure/
    persistence/          # Arquivo JSON e validação dos dados
  modules/
    auth/                 # Cadastro e autenticação
      controllers/
      services/
      guards/
      dto/
      auth.module.ts
    animals/              # Catálogo de animais
      controllers/
      services/
      dto/
      animals.module.ts
    applications/         # Solicitações e decisões de adoção
      controllers/
      services/
      dto/
      applications.module.ts
    health/               # Saúde da API
      controllers/
      health.module.ts
  app.module.ts
  setup-app.ts
  main.ts
test/                     # Testes HTTP
docs/arquitetura/          # Documento e diagramas
```

A organização é modular por funcionalidade e responsabilidade: controllers recebem HTTP, services executam as regras, DTOs validam entradas e domain contém os modelos. A API retorna JSON e não possui camada de views HTML. AppModule importa os módulos. PersistenceModule fornece um único StoreService compartilhado, e AuthModule exporta os recursos de autenticação. As integrações de produção propostas no relatório continuam pendentes.

Use `npm run format` para padronizar o código e `npm run format:check` para conferir a formatação. O padrão usa dois espaços de indentação, aspas simples e largura de referência de 100 caracteres por linha.

## Documentação

- [Fontes dos diagramas Mermaid](docs/arquitetura/diagramas/)

Os diagramas C4 descrevem a versão local com persistência JSON, revisada em 24/09/2026. JWT, PostgreSQL, Redis e Docker continuam planejados.

O relatório acadêmico fica somente no computador do grupo por conter dados pessoais. Cada diagrama possui uma única fonte editável em `.mmd`:

| Diagrama | Arquivo | Uso |
| --- | --- | --- |
| Responsabilidades | [09-camadas.mmd](docs/arquitetura/diagramas/09-camadas.mmd) | Figura 1 do relatório |
| Contexto C4 | [01-contexto-c4.mmd](docs/arquitetura/diagramas/01-contexto-c4.mmd) | Figura 2 do relatório |
| Containers C4 | [02-containers-c4.mmd](docs/arquitetura/diagramas/02-containers-c4.mmd) | Figura 3 do relatório |
| Componentes C4 | [03-componentes-c4.mmd](docs/arquitetura/diagramas/03-componentes-c4.mmd) | Figura 4 do relatório |
| Classes UML | [04-classes-uml.mmd](docs/arquitetura/diagramas/04-classes-uml.mmd) | Figura 5 do relatório |
| Sequência de aprovação | [06-sequencia-aprovacao.mmd](docs/arquitetura/diagramas/06-sequencia-aprovacao.mmd) | Figura 6 do relatório |
| Visão geral atual | [08-arquitetura-atual.mmd](docs/arquitetura/diagramas/08-arquitetura-atual.mmd) | Complemento da arquitetura |
| Modelo relacional | [05-modelo-relacional.mmd](docs/arquitetura/diagramas/05-modelo-relacional.mmd) | Proposta para novembro |
| Implantação em VPS | [07-implantacao-vps.mmd](docs/arquitetura/diagramas/07-implantacao-vps.mmd) | Proposta para novembro |

## Contas locais

| Perfil | E-mail | Senha |
| --- | --- | --- |
| ONG | ong@adotapet.local | 123456 |
| Adotante | adotante@adotapet.local | 123456 |
| Admin | admin@adotapet.local | 123456 |

Essas contas são criadas automaticamente para demonstração local.

## Fluxo de adoção

1. Faça `POST /api/auth/login` com `email` e `password` de um adotante.
2. Use o `accessToken` retornado em `Authorization: Bearer <token>`. No botão Authorize do Swagger, informe somente o token.
3. Consulte `GET /api/animals` e copie o ID de um animal disponível.
4. Faça `POST /api/animals/{animalId}/applications` com `{"reason":"Quero adotar"}`. O motivo é opcional; `{}` também é aceito.
5. Entre com a ONG responsável e consulte `GET /api/applications/me`.
6. Aprove em `PATCH /api/applications/{id}/approve` ou recuse em `PATCH /api/applications/{id}/reject`.

## Contratos e regras

- Cadastro público permite `ONG` ou `ADOTANTE` (padrão). `ADMIN` não pode ser escolhido no cadastro público.
- E-mails são normalizados para minúsculas; duplicatas retornam 409.
- Senhas exigem de 6 a 128 caracteres e são armazenadas como hash scrypt com salt individual.
- Tokens são aleatórios, duram 24 horas e deixam de funcionar após reiniciar a aplicação.
- Campos desconhecidos, dados inválidos e IDs que não sejam UUID retornam 400. Consulte os campos obrigatórios no Swagger.
- Rotas protegidas retornam 401 para autenticação ausente/inválida e 403 para usuário sem permissão.
- ONG e administrador podem cadastrar animais. Apenas o responsável pelo animal pode decidir solicitações.
- Adotantes veem suas próprias solicitações; ONG e administrador veem as dos animais que cadastraram.
- Uma aprovação marca o animal como adotado e recusa as demais solicitações pendentes para ele. Solicitações já analisadas não podem ser decididas novamente.
- Recusar uma solicitação mantém o animal disponível. Duplicatas pendentes e solicitações para animais adotados retornam 409.

## Dados persistentes

A API cria `data/adotapet.json` na primeira execução. As contas de demonstração e Mel são criadas somente quando esse arquivo não existe. Cadastros, solicitações, aprovações e recusas são gravados antes da resposta de sucesso. Não apague a pasta `data` ao atualizar o projeto.

Use somente um processo da API por arquivo; esta implementação não coordena gravações de múltiplas instâncias. PostgreSQL e transações de banco seguem como evolução.

Execute os comandos a partir da raiz do projeto. Para escolher outro arquivo no PowerShell:

```powershell
$env:DATA_FILE = 'C:\caminho\adotapet.json'
npm run start:dev
```

O arquivo contém dados de cadastro e hashes de senha; mantenha-o privado e faça backups. Tokens de sessão não são salvos. Uma falha de gravação retorna 503 e restaura o estado anterior em memória. Um arquivo existente inválido impede a inicialização e não é sobrescrito; restaure um backup ou corrija os dados.

Os testes usam armazenamento isolado e arquivos temporários. Verificam recuperação após reiniciar, integridade da aprovação e falhas de leitura/gravação, sem alterar os dados da aplicação normal.
