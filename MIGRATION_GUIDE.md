# Migration Guide - ConsolidaHub

## Executar Migrations com Prisma

### 1. Primeira vez (criar tabelas)

```bash
# Gerar migration baseada no schema.prisma
npx prisma migrate dev --name init

# Isso vai:
# 1. Criar pasta prisma/migrations
# 2. Gerar arquivo de migration SQL
# 3. Executar migration no banco
# 4. Gerar Prisma Client
```

### 2. Atualizar schema.prisma e criar nova migration

```bash
# Exemplo: adicionar novo campo
# Editar prisma/schema.prisma

# Criar migration
npx prisma migrate dev --name add_field_name

# Isso vai detectar mudanças, gerar SQL e aplicar
```

### 3. Em produção (deploy)

```bash
# Apenas aplicar migrations (sem gerar código)
npx prisma migrate deploy
```

### 4. Resetar banco de dados (desenvolvimento apenas)

```bash
# ⚠️ DESTRUTIVO - deleta todos os dados
npx prisma migrate reset

# Vai:
# 1. Deletar banco
# 2. Recriar banco
# 3. Aplicar todas as migrations
# 4. Executar seed (se houver)
```

### 5. Ver status das migrations

```bash
# Listar migrations aplicadas
npx prisma migrate status

# Ver SQL de uma migration específica
cat prisma/migrations/20240524120000_init/migration.sql
```

## Estrutura de Migrations

```
prisma/
├── migrations/
│   ├── migration_lock.toml
│   ├── 20240524120000_init/
│   │   └── migration.sql
│   └── 20240524120100_add_rules_table/
│       └── migration.sql
├── schema.prisma
└── seed.ts
```

## Exemplo: Adicionar Campo à Tabela Rules

### 1. Editar schema.prisma

```prisma
model Rule {
  // ... campos existentes
  
  // Novo campo
  tags        String[] @default([])
  
  // ... resto
}
```

### 2. Executar migration

```bash
npx prisma migrate dev --name add_tags_to_rules
```

### 3. Verificar SQL gerado

```sql
-- prisma/migrations/TIMESTAMP_add_tags_to_rules/migration.sql
ALTER TABLE "rules" ADD COLUMN "tags" text[] DEFAULT '{}';
```

## Boas Práticas

✅ **Sempre descrever mudanças com `--name`**
```bash
npx prisma migrate dev --name add_tags_to_rules
# ❌ Evite: npx prisma migrate dev
```

✅ **Revisar SQL gerado antes de aplicar**
```bash
npx prisma migrate dev --skip-generate
# Editar migration.sql se necessário
```

✅ **Usar transações em migrations complexas**
```sql
-- Já vem por padrão em PostgreSQL com Prisma
BEGIN;
-- suas operações
COMMIT;
```

✅ **Testar migrations localmente primeiro**
```bash
# Local com docker
docker-compose up -d postgres
npx prisma migrate dev
```

## Troubleshooting

### Erro: "Prisma Client não foi gerado"

```bash
npx prisma generate
```

### Erro: "Migration falhou"

```bash
# Ver logs detalhados
npx prisma migrate dev --verbose

# Ou resetar se necessário (dev apenas)
npx prisma migrate reset
```

### Erro: "Banco não existe"

```bash
# Criar banco
npx prisma db push

# Ou via connection string
DATABASE_URL="postgresql://user:pass@localhost:5432/consolidahub" npx prisma db push
```

## Variáveis de Ambiente

```env
# .env
DATABASE_URL=postgresql://consolidahub:password@localhost:5432/consolidahub

# .env.production
DATABASE_URL=postgresql://prod_user:prod_pass@prod-host:5432/consolidahub_prod

# Carregar
export $(cat .env | xargs)
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run migrations
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY . .

RUN npm install
RUN npx prisma migrate deploy
RUN npm run build

CMD ["npm", "start"]
```
