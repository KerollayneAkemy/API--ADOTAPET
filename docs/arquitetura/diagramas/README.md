# Diagramas da arquitetura AdotaPet

Os arquivos são fontes editáveis e descrevem a implementação atual da API. Cada vista responde a uma pergunta diferente; não são diagramas intercambiáveis.

| Arquivo | Notação | O que mostra |
|---|---|---|
| `01-contexto-c4.mmd` | C4 · Contexto (C1) | Pessoas, sistema e serviço externo de imagens. |
| `02-containers-c4.mmd` | C4 · Containers (C2) | API, PostgreSQL, Redis e R2, com suas integrações. |
| `03-componentes-c4.mmd` | C4 · Componentes (C3) | Responsabilidades dentro da API NestJS. |
| `04-modelo-relacional.mmd` | ER | Tabelas, chaves e cardinalidades do PostgreSQL. |
| `05-sequencia-aprovacao.mmd` | UML · Sequência | Mensagens e ordem das operações na aprovação. |
| `06-implantacao-coolify.mmd` | C4 · Implantação | Serviços na VPS Hostinger gerenciada pelo Coolify. |
| `07-casos-de-uso.puml` | UML · Casos de uso | Atores e funcionalidades disponíveis conforme o papel. |
| `08-classes-dominio.mmd` | UML · Classes | Entidades, atributos, enumerações e relações. |
| `09-atividade-decisao.puml` | UML · Atividade | Decisões, caminhos de erro e transação da adoção. |

## Regras representadas

- A solicitação é feita por um usuário `ADOTANTE` e só pode ser decidida pelo `ONG` ou `ADMIN` responsável pelo animal.
- A decisão bloqueia primeiro a linha do animal e depois a solicitação. Aprovar altera o animal para `ADOTADO` e recusa outros pedidos pendentes; recusar não altera o animal.
- Fotos ficam em bucket privado no R2. O banco guarda os identificadores dos objetos associados ao animal.
- A tabela `idempotency_keys` guarda escopo, chave, hash da requisição, status HTTP e resposta. `schema_migrations` é controle interno da infraestrutura de migração e foi omitida do ER de domínio.
- O diagrama de classes é uma vista conceitual dos tipos de domínio e da estrutura persistida; não afirma que cada tipo TypeScript seja uma classe concreta.

Os arquivos `.mmd` usam sintaxe Mermaid (C4, ER, sequência e classes). Os arquivos `.puml` usam PlantUML, que fornece a notação UML padrão de casos de uso e atividades.