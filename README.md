# ConsolidaHub

Plataforma corporativa de regras de negócio e consolidação de dados: cadastro e versionamento de
regras, importação de bases externas (CSV/XLSX), execução rastreável e reproduzível das regras e
geração do **Relatório Consolidado**, com login Microsoft Entra ID, permissões por papel e
trilha de auditoria.

> **Estado atual:** fundação do MVP refatorada e testada localmente (ver
> [evidências](docs/auditoria/05-evidencias-de-validacao.md)). Antes de usar: regenerar os
> lockfiles (`npm install` na raiz e em `web/`), executar a CI completa e cumprir as
> [pendências para produção](docs/auditoria/06-pendencias-para-producao.md). Nuvem: só a **fase 1
> do ambiente dev** está provisionada (02/11/2026, `brazilsouth`); a aplicação ainda não foi
> implantada ([registro](docs/auditoria/09-execucao-azure-dev.md)).

## Stack

| Camada | Tecnologia |
| --- | --- |
| API e worker | Node.js 22 LTS, TypeScript 5, NestJS 10 (monólito modular; processos separados) |
| Persistência | PostgreSQL 16, Prisma 5.22 (migrations versionadas) |
| Fila de processamento | Tabela no PostgreSQL com `FOR UPDATE SKIP LOCKED` |
| Web | Next.js 14 (App Router), React 18, MSAL (pacote separado em `web/`) |
| Autenticação | Microsoft Entra ID — access tokens v2.0 validados pela API (RS256/JWKS) |
| Planilhas | SheetJS CE 0.20.3 |
| Contrato | OpenAPI 3.1 (`contracts/openapi.yaml`), verificado por teste |
| Infra | Docker, Docker Compose (local), Terraform para Azure Container Apps, GitHub Actions |

## Estrutura

```
src/                 API (main.ts) e worker (worker.ts) — módulos em src/modules/*
prisma/              schema.prisma e migrations
test/                unit, contract, e2e e integration (Jest)
contracts/           openapi.yaml (fonte única da API)
web/                 frontend Next.js (pacote npm próprio)
infra/terraform/     Azure (Container Apps, PostgreSQL Flexible, Key Vault, ACR)
infra/database/      papel de banco de menor privilégio
docs/                arquitetura, ADRs, guias e relatórios de auditoria
scripts/dev.mjs      modo de desenvolvimento (tsc --watch + node --watch)
```

## Início rápido

```bash
npm install && npm --prefix web install        # gera os lockfiles e o Prisma Client
cp .env.example .env                           # preencha os IDs do Entra ID de desenvolvimento
docker compose up --build                      # web: http://localhost:3001  api: http://localhost:3000/api/v1
```

Passo a passo, alternativa sem Compose e primeiro administrador:
[docs/guias/ambiente-local.md](docs/guias/ambiente-local.md).

## Scripts principais

| Script | Descrição |
| --- | --- |
| `npm run dev:api` / `dev:worker` / `dev:web` | Desenvolvimento com recarga |
| `npm run build` / `build:web` | Compila a API+worker (`dist/`) / o web |
| `npm run typecheck`, `npm run lint` | Verificações estáticas (API e testes) |
| `npm test` | Testes unitários, de contrato e e2e (sem dependências externas) |
| `npm run test:integration` | Testes com PostgreSQL real (banco `*_test`) |
| `npm run verify` / `verify:web` | Tudo o que a CI verifica, localmente |
| `npm run db:migrate:deploy` / `db:seed` | Aplica migrations / catálogo de papéis e permissões |
| `npm run admin:grant-role -- …` | Concede papel a um usuário (bootstrap do primeiro administrador) |

## Documentação

* Arquitetura: [visão geral](docs/arquitetura/visao-geral.md) ·
  [autenticação](docs/arquitetura/autenticacao.md) · [segurança](docs/arquitetura/seguranca.md) ·
  [processamento](docs/arquitetura/processamento.md) · [ADRs](docs/arquitetura/adr/README.md)
* Regras: [semântica do motor](docs/regras/semantica-do-motor.md)
* Guias: [ambiente local](docs/guias/ambiente-local.md) · [banco de dados](docs/guias/banco-de-dados.md) ·
  [testes](docs/guias/testes.md) · [contrato OpenAPI](docs/guias/contrato-openapi.md) ·
  [deploy](docs/guias/deploy.md) · [operação](docs/guias/operacao.md)
* Auditoria técnica (out/2026): [índice dos entregáveis](docs/auditoria/README.md)

## Segurança

Não há login fictício nem atalho de autenticação em nenhum ambiente. Nunca versione `.env`,
segredos, tokens ou dados reais. Vulnerabilidades: reporte de forma privada à equipe responsável.
