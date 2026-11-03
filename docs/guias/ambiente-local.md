# Ambiente local de desenvolvimento

## 1. Pré-requisitos

* Node.js **22 LTS** (≥ 22.11, < 25 — ver `.nvmrc`) e npm 10.
* Docker Desktop (ou Docker Engine + Compose v2) para o PostgreSQL local.
* Acesso de rede a `registry.npmjs.org`, `binaries.prisma.sh` (engines do Prisma) e
  `cdn.sheetjs.com` (pacote `xlsx`, [ADR-0007](../arquitetura/adr/0007-sheetjs-pela-cdn-oficial.md)).
* Registros de aplicativo do Entra ID de **desenvolvimento** (API + SPA) —
  [autenticacao.md](../arquitetura/autenticacao.md#1-registros-de-aplicativo-por-ambiente).
  Não existe modo sem login: a API valida tokens reais também localmente.

## 2. Primeira instalação (obrigatório após aplicar esta refatoração)

As dependências mudaram (o frontend virou um pacote separado), então os lockfiles precisam ser
regenerados e **versionados**:

```bash
npm install                 # raiz (API/worker): atualiza package-lock.json e roda `prisma generate`
npm --prefix web install    # web: cria web/package-lock.json
git add package-lock.json web/package-lock.json
```

> O erro `Module '@prisma/client' has no exported member 'PrismaClient'` significa que o client
> não foi gerado. Ele é gerado no `postinstall`; para regenerar: `npm run prisma:generate`.

## 3. Configuração

```bash
cp .env.example .env                 # API, worker e Compose (PowerShell: Copy-Item .env.example .env)
cp web/.env.example web/.env.local   # somente para `npm run dev:web` fora do Compose
```

Preencha `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_ALLOWED_CLIENT_IDS` (SPA),
`NEXT_PUBLIC_ENTRA_CLIENT_ID` e `NEXT_PUBLIC_API_SCOPE`. Troque `POSTGRES_PASSWORD` e mantenha-a
igual à senha das URLs `DATABASE_URL`/`SHADOW_DATABASE_URL`. Nunca versione `.env`.

> **Dev (02/11/2026):** o `.env` e o `web/.env.local` desta máquina foram preenchidos por script
> com os IDs dos registros de dev e uma `POSTGRES_PASSWORD` aleatória nova (valores só nesses
> arquivos, fora do Git). Se o volume `postgres-data` já existia, a senha nova **não** vale
> sozinha: a imagem do PostgreSQL só usa `POSTGRES_PASSWORD` ao inicializar um volume vazio.
> Recrie o volume (`docker compose down -v`, que apaga os dados locais) ou altere a senha do
> usuário `consolidahub` no banco.

## 4. Opção A — tudo no Docker Compose

```bash
docker compose up --build
```

| Serviço | Endereço | Observação |
| --- | --- | --- |
| web | http://localhost:3001 | registre `http://localhost:3001/` como redirect URI do SPA |
| api | http://localhost:3000/api/v1 | `GET /health/ready` |
| postgres | 127.0.0.1:5432 | somente na interface local |
| migrate | — | aplica migrations + seed e termina |

## 5. Opção B — banco no Compose, aplicações no host (desenvolvimento diário)

```bash
docker compose up -d postgres
npm run db:migrate:deploy        # aplica prisma/migrations
npm run build:api && npm run db:seed
npm run dev:api                  # tsc --watch + node --watch (API)
npm run dev:worker               # em outro terminal
npm run dev:web                  # em outro terminal (usa web/.env.local)
```

Para criar uma nova migration durante o desenvolvimento use `npm run db:migrate:dev -- --name
<descricao>` (somente no banco local; ver [banco-de-dados.md](banco-de-dados.md)).

## 6. Primeiro administrador local

1. Acesse http://localhost:3001 e entre com sua conta (você é provisionado sem papéis).
2. Conceda o papel:
   ```bash
   npm run build:api
   npm run admin:grant-role -- --tenant-id <seu-tid> --object-id <seu-oid> --role ADMIN
   ```
3. Recarregue a página.

## 7. Verificações antes de abrir um PR

```bash
npm run verify         # prisma validate, typecheck, lint, testes (unit + contrato + e2e), build
npm run verify:web     # typecheck, lint e build do web
npm run test:integration   # requer PostgreSQL de teste (ver testes.md)
```

## 8. Depuração (VS Code)

`.vscode/launch.json` tem configurações para API, worker, Jest (todos, arquivo atual,
integração). O depurador do VS Code anexa automaticamente aos processos Node iniciados pelos
scripts.
