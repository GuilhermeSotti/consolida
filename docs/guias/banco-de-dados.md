# Banco de dados: Prisma, migrations, seed e papéis

## 1. Versões e geração do client

* `prisma` e `@prisma/client` fixados em **5.22.0** (mesma versão, sem `^`) — versões
  divergentes entre CLI e client geram clients incompatíveis.
* O client é gerado por `postinstall` (`prisma generate`) e explicitamente no `Dockerfile`, antes
  da compilação. Causa raiz do erro herdado `has no exported member 'PrismaClient'`: nenhum passo
  gerava o client (e o Dockerfile compilava antes de gerar).

## 2. Migrations

* Fonte da verdade do esquema: `prisma/schema.prisma` + `prisma/migrations/`.
* `20261023000000_baseline` cria o esquema completo do MVP, validado em PostgreSQL 16 em banco
  vazio, e acrescenta o que o Prisma não modela: CHECKs e os triggers que tornam `audit_events`
  somente-inclusão e `rule_versions` imutável.
* A migration herdada (`001_create_audit_logs`) foi removida: falhava em banco vazio
  (`relation "users" does not exist`) e não correspondia ao schema, portanto nenhum banco pode
  ter sido criado por `migrate deploy` a partir dela.
* **Banco já existente** (criado de outra forma, ex.: `db push`): não aplique a migration de base
  às cegas e não o recrie sem decisão do responsável pelos dados. Compare primeiro
  (`npx prisma migrate diff --from-url "$DATABASE_URL" --to-migrations prisma/migrations --shadow-database-url "$SHADOW_DATABASE_URL" --script`);
  se forem equivalentes, registre a base como aplicada
  (`npx prisma migrate resolve --applied 20261023000000_baseline`); se não forem, planeje uma
  migração de dados específica.

| Comando | Uso |
| --- | --- |
| `npm run db:migrate:dev -- --name x` | **Somente local**: gera nova migration a partir do schema e aplica |
| `npm run db:migrate:deploy` | Aplica migrations pendentes (CI, job de migração, ambientes) |
| `npm run db:migrate:check` | Falha se as migrations não reproduzem o `schema.prisma` (*drift*); exige `SHADOW_DATABASE_URL` |
| `npm run prisma:validate` | Valida o schema |

> `prisma db push` e `prisma migrate reset` **não** devem ser usados em ambientes compartilhados
> (descartam histórico/dados). No PowerShell, `db:migrate:check` não expande `$SHADOW_DATABASE_URL`;
> use `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $env:SHADOW_DATABASE_URL --exit-code`.

### 2.1 Regras para novas migrations

1. **Expandir/contrair**: o job de migração roda **antes** da troca de imagem, então a versão
   anterior da aplicação precisa funcionar com o esquema novo (adicionar colunas anuláveis ou com
   *default*, criar tabelas; remover/renomear apenas numa versão posterior).
2. Nunca editar uma migration já aplicada em algum ambiente; corrigir com outra migration.
3. Operações destrutivas (DROP, alteração de tipo com perda) exigem aprovação explícita, backup
   verificado e plano de rollback.
4. Tabelas novas: rever as permissões do papel da aplicação (`infra/database/app-role.sql`).
5. Rollback: o Prisma não gera *down migrations*. A estratégia é *roll forward* (nova migration);
   em incidente grave, restauração *point-in-time* do Flexible Server.

## 3. Seed

`npm run db:seed` (após `npm run build:api`) executa `dist/database/seed.js`: cria/atualiza
permissões, papéis e a matriz papel × permissão a partir de
`src/modules/auth/domain/access-control.ts`. É idempotente, não cria usuários, não contém dados
sensíveis e é executado pelo job de migração em todo deploy.

## 4. Papéis de banco (menor privilégio)

| Papel | Uso | Permissões |
| --- | --- | --- |
| Papel das migrations (admin do Flexible Server, ou `consolidahub` no Compose) | Job de migração e seed | Dono das tabelas (DDL) |
| `consolidahub_app` | API, worker e CLI `admin:grant-role` | `SELECT/INSERT/UPDATE`; `DELETE` só em `user_roles` e `import_chunks`; sem `UPDATE` em `audit_events`/`rule_versions`; sem `TRUNCATE`, DDL ou acesso a `_prisma_migrations` |

Criação/atualização (idempotente), conectado com o papel das migrations:

```bash
psql "host=<host> dbname=consolidahub user=<papel-das-migrations> sslmode=require" -f infra/database/app-role.sql
psql "host=<host> dbname=consolidahub user=<papel-das-migrations> sslmode=require" -c "\password consolidahub_app"
```

O script foi validado em PostgreSQL 16: aplicado duas vezes (idempotente) e verificado que o
papel lê e grava dados, mas recebe *permission denied* em `UPDATE/DELETE` de auditoria,
`TRUNCATE`, `CREATE TABLE`, `DROP`, `ALTER TABLE … DISABLE TRIGGER` e leitura de
`_prisma_migrations`; tabelas novas herdam `SELECT/INSERT/UPDATE` (sem `DELETE`).

No Compose local (`NODE_ENV=development`) a aplicação usa o próprio usuário `consolidahub` (dono)
por simplicidade. Com `NODE_ENV=production`, API e worker verificam na inicialização se o papel
conectado é dono (ou membro do dono) das tabelas e **recusam iniciar** — o papel restrito é
obrigatório em hml/prod ([deploy.md](deploy.md)). O script usa o banco corrente
(`current_database()`) e funciona antes ou depois da primeira migration.

## 5. Testes de integração

Usam um banco **descartável** cujo nome termina em `_test` (proteção contra execução acidental:
os testes truncam todas as tabelas). Ver [testes.md](testes.md).
