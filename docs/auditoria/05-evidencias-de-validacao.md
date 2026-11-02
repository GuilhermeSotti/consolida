# Entregável 4 — Evidências de validação

> Execução em 23–24/10/2026 (reexecutada após as correções da [revisão independente](08-revisao-final.md)),
> sobre a árvore final da branch `refactor/consolidahub-fundacao`
> (base `f3d256e` + alterações deste trabalho). Ambiente: contêiner Linux com Node.js 22.22.0,
> TypeScript 6.0.3 global, PostgreSQL 16.15, Docker CLI 29.9 / Compose v5.6 (sem daemon útil
> para builds), Python 3.13. **Sem acesso** ao registro npm, ao PyPI, a `binaries.prisma.sh` e a
> `cdn.sheetjs.com` (HTTP 403 no proxy); GitHub acessível por `git clone`.

Status: **Aprovado** (executado e passou) · **Reprovado** (executado e falhou) · **Não executado**
· **Bloqueado por dependência externa**. Quando a verificação foi feita por um meio equivalente
(e não pelo comando do projeto), isso está indicado — o comando real continua pendente de
execução na CI/máquina do desenvolvedor.

## 1. Resumo

| # | Verificação | Comando do projeto | Como foi verificado aqui | Resultado | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Instalação | `npm ci` | — | registro npm 403 | **Bloqueado** |
| 2 | Lockfiles coerentes | `npm ci` | — | `package-lock.json` não regenerado; `web/package-lock.json` inexistente | **Bloqueado** (ação obrigatória do dev) |
| 3 | Prisma validate/generate | `npm run prisma:validate`, `prisma generate` | — | engines 403 | **Bloqueado** |
| 4 | Migration em banco vazio | `prisma migrate deploy` | `psql --single-transaction -f migration.sql` em PostgreSQL 16.15 | 19 tabelas criadas, sem erro | **Aprovado** (equivalente) |
| 5 | Drift schema × migrations | `npm run db:migrate:check` | verificador estrutural próprio (tipos, enums, PK/unique/índices, FKs/`onDelete`, defaults) contra o banco migrado | 19 modelos, 14 enums, **0 divergências** | **Aprovado** (equivalente) |
| 6 | Typecheck API + testes | `npm run typecheck` | `tsc` 6.0.3 estrito contra fontes reais de NestJS 10.4.22, rxjs 7.8.2, @nestjs/throttler 5.2.0, helmet 7.2.0, tipos DefinitelyTyped e *stub* do Prisma Client gerado do schema | 0 erros no repositório | **Aprovado** (equivalente) |
| 7 | Typecheck web | `npm run typecheck` (web) | `tsc` contra @types/react 18, fontes do MSAL e *stub* da API do Next 14 | 0 erros; teste negativo detecta erros injetados | **Aprovado** (equivalente) |
| 8 | Lint API/testes | `npm run lint` | `eslint.config.mjs` do projeto com ESLint **10.1.0** (pré-instalado; o projeto trava 8.57.1), `@eslint/js` 8.57.1 e typescript-eslint 8.60.1 compilado das fontes | 147 arquivos, 0 erros, 0 avisos (6 erros encontrados e corrigidos) | **Aprovado** (equivalente) |
| 9 | Lint web | `next lint --max-warnings 0` | ESLint 10 + typescript-eslint + `react-hooks` (fontes do React 18.3.1, plugin 4.5) + reimplementação de `react/jsx-key` e `react/no-unescaped-entities`; demais regras do `eslint-config-next` não cobertas | 27 arquivos, 0 erros, 0 avisos (1 aviso encontrado e corrigido) | **Não executado** (aproximação aprovada) |
| 10 | Testes unitários | `npm run test:unit` | compilados com `tsc` e executados por *runner* compatível com a API do Jest (tipos reais do @types/jest) | **201/201** aprovados, 22 arquivos | **Aprovado** (equivalente) |
| 11 | Testes de contrato | `npm run test:contract` | runtime Nest compilado das fontes | **6/6** aprovados | **Aprovado** (equivalente) |
| 12 | Testes e2e HTTP | `npm run test:e2e` | aplicação Nest real (Express 4, multer, helmet, throttler) com persistência em memória | **22/22** aprovados (inclui exportação abortada no meio) | **Aprovado** (equivalente) — XLSX testado com SheetJS 0.18.5, não 0.20.3 |
| 13 | Testes de integração (Prisma + PostgreSQL) | `npm run test:integration` | tipados (item 6), não executados | Prisma Client real indisponível | **Bloqueado** |
| 14 | SQL da fila | — | *claim* com `SKIP LOCKED`, *lease* expirado, job futuro; duas sessões concorrentes | cada sessão obteve um job diferente; job vencido reivindicado com `attempts=2` | **Aprovado** |
| 15 | Imutabilidade e integridade | — | UPDATE/DELETE em `audit_events` e `rule_versions`; versão duplicada; versão 0; DELETE de fonte referenciada | todos rejeitados pelo banco | **Aprovado** |
| 16 | Papel DML de menor privilégio | — | `infra/database/app-role.sql` aplicado 2× em bancos novos (com e sem `_prisma_migrations`) e testado como `consolidahub_app` | DML permitido; UPDATE/DELETE de auditoria, TRUNCATE, DDL, DISABLE TRIGGER e `_prisma_migrations` negados; tabela nova sem DELETE | **Aprovado** |
| 16b | Recusa de credencial dona em produção | — | consulta do `PrismaService` executada como dono, como membro do papel dono e como `consolidahub_app` | `t`, `t`, `f` | **Aprovado** (SQL); inicialização real não executada |
| 16c | XLSX malicioso (A1 + XFD1, 20 mil linhas, 152 KB) | — | leitor anterior × leitor corrigido, heap de 1,5 GB | anterior: processo abortado por falta de memória; corrigido: `TOO_MANY_COLUMNS` em 175 ms, 102 MB | **Aprovado** |
| 17 | Contrato OpenAPI (estático) | — | auditoria do documento 3.1: `$ref` resolvíveis, ausência de palavras-chave exclusivas do 3.0 (`nullable` etc.), `operationId`, parâmetros de path, 401/403 | 40 operações, 0 erros, 0 avisos | **Aprovado** |
| 18 | Build API | `npm run build:api` | compilação equivalente para CommonJS usada pelos e2e | sem erros | **Não executado** (equivalente aprovado) |
| 19 | Build web | `npm run build` (web) | — | Next.js não instalável | **Bloqueado** |
| 20 | Imagens Docker | `docker build` | — | sem acesso a registros | **Bloqueado** |
| 21 | Compose | `docker compose config` | com variáveis fictícias; e sem elas | válido; sem variáveis falha com as mensagens previstas | **Aprovado** |
| 22 | Terraform | `terraform validate` / `plan` | sintaxe HCL (python-hcl2) + checagem de variáveis/recursos/tfvars | 10 arquivos sem erro; 0 referências quebradas | **Não executado** (`validate/plan`); sintaxe **Aprovada** |
| 23 | Workflows GitHub Actions | execução na CI | YAML válido; actions fixadas por SHA | 3 workflows válidos; 0 actions sem SHA | **Não executado** |
| 24 | Varredura de segredos | — | padrões de chaves/tokens/URLs internas em 245 arquivos | nenhum segredo; apenas valores fictícios | **Aprovado** |
| 25 | Script de desenvolvimento | `npm run dev:api` | `scripts/dev.mjs` com projeto mínimo | compila, observa e reinicia após alteração | **Aprovado** |
| 26 | Login real no Entra ID | — | — | sem tenant/registro disponível | **Não executado** |
| 27 | `npm audit`, CodeQL, Trivy | CI | — | — | **Não executado** |
| 28 | AI-Harness | `pytest`; `maestro run` | cópia isolada | 58 testes aprovados; execução do Maestro concluída em modo **simulado** | **Aprovado** (sem capacidade real — ver 07) |
| 29 | Links internos da documentação | — | verificador de links relativos e âncoras no padrão do GitHub (com teste negativo) | 96 links, 0 quebrados | **Aprovado** |
| 30 | Aplicação do patch de entrega | `apply-consolidahub-refactor.ps1` | mesma sequência de comandos git reproduzida em bash (PowerShell indisponível) sobre clones do commit base, com `core.autocrlf` `false` e `true` | árvore resultante idêntica à da branch de trabalho; arquivo não versionado preservado; nenhum commit; recusa quando a branch já existe | **Não executado** (o script PowerShell); fluxo equivalente **Aprovado** |

Nenhuma verificação executada terminou reprovada no estado final. As reprovações do estado
inicial (migration, typecheck, compose, contrato) estão no [entregável 1](01-estado-inicial.md).

## 2. Saídas relevantes

```text
TYPECHECK OK (TypeScript 6.0.3; diagnósticos apenas em fontes de dependências)
Total: 201 testes, 201 aprovados, 0 reprovados, 22 arquivos.          # unitários
PASS test/contract/openapi.contract-spec.ts (6 testes)
PASS test/e2e/api.e2e-spec.ts (22 testes)
WEB TYPECHECK OK
ESLint API: 147 arquivos, 0 erros, 0 avisos · Web (aproximação): 27 arquivos, 0 erros, 0 avisos
OpenAPI: 0 erro(s), 0 aviso(s), 40 operação(ões)
migration: exit 0 · tabelas: 19 · drift: 19 modelos, 14 enums verificados; 0 divergência(s)
docker compose config: OK (variáveis fictícias)
HCL: 10 arquivo(s), 0 com erro de sintaxe
```

Fila (sessão única): *claim* 1 → job pendente (`attempts=1`); *claim* 2 → job com *lease*
vencido (`attempts=2`); *claim* 3 → nenhum (job agendado para o futuro). Duas sessões
concorrentes com transações abertas receberam jobs distintos (`worker-A`/`worker-B`).

Papel `consolidahub_app`: `SELECT/INSERT/UPDATE` e `DELETE` em `user_roles` OK;
`UPDATE/DELETE audit_events` → *permission denied*; `DELETE users` → *permission denied*;
`TRUNCATE background_jobs` → *permission denied*; `ALTER TABLE … DISABLE TRIGGER` → *must be
owner*; `CREATE TABLE` → *permission denied for schema public*; `SELECT _prisma_migrations` →
*permission denied*.

## 3. Defeitos encontrados durante a validação (e corrigidos)

| Origem | Defeito | Correção |
| --- | --- | --- |
| e2e | Colunas geradas `FILE_ID`/`VOLUME` não apareciam no relatório | `normalizeTabularImport` passa a incluí-las em `columns` |
| Lint | 2× `no-control-regex`, 2× `no-irregular-whitespace`, 2× `no-explicit-any` | ver [03 §10](03-relatorio-de-alteracoes.md#10-ajustes-da-etapa-final-de-validação) |
| Lint web | `react-hooks/exhaustive-deps` em `executions/[id]` | dependências estáveis explícitas |
| Revisão | Healthcheck do worker reprovava jobs longos | heartbeat durante o job + endpoint HTTP |
| Revisão | Corrida na detecção de upload duplicado | *lock* da fonte na transação |
| Revisão independente | 12 achados procedentes (XLSX, exportação, autoconcessão de papéis, identidades no Azure, LOOKUP, lease, CSV, health, atomicidade) | ver [08-revisao-final.md](08-revisao-final.md) |

## 4. O que precisa ser executado fora deste ambiente (ordem sugerida)

1. `npm install` e `npm --prefix web install` (gera lockfiles) → commit dos lockfiles.
2. `npm run verify` e `npm run verify:web`.
3. `npm run test:integration` com PostgreSQL `*_test` e `npm run db:migrate:check`.
4. CI completa (inclui imagens, Trivy, CodeQL e revisão de dependências).
5. `terraform validate` e `terraform plan` por ambiente.
6. Login real com os registros do Entra ID de desenvolvimento e o fluxo de fumaça do MVP.
