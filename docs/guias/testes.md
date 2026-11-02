# Estratégia de testes

| Projeto Jest | Comando | Escopo | Dependências externas |
| --- | --- | --- | --- |
| `unit` | `npm run test:unit` | Domínio e casos de uso (motor de regras, verificação de JWT, JWKS, parsers CSV, normalização de cargas, máquina de estados, idempotência, administração de usuários, configuração, redação de logs, liveness do worker) com *fakes* em memória | nenhuma |
| `contract` | `npm run test:contract` | `contracts/openapi.yaml` × controllers (rotas, status de sucesso, permissões, rotas públicas) + consistência do documento | nenhuma |
| `e2e` | `npm run test:e2e` | Aplicação Nest real por HTTP (guards, filtros, helmet, CORS, limites de corpo, multer, streaming de exportação, XLSX) com persistência em memória e tokens assinados por chave de teste validados como tokens do Entra | nenhuma |
| `integration` | `npm run test:integration` | Repositórios Prisma, transações, triggers de imutabilidade, fila de jobs (`SKIP LOCKED`, lease, retentativas) | PostgreSQL real |

`npm test` executa `unit`, `contract` e `e2e`; a CI executa também `integration` (job
`database`, PostgreSQL 16 em contêiner de serviço).

## Testes de integração

```bash
# banco descartável — o nome PRECISA terminar em _test (os testes truncam todas as tabelas)
docker compose up -d postgres
docker compose exec postgres psql -U consolidahub -c "CREATE DATABASE consolidahub_test"
export DATABASE_URL="postgresql://consolidahub:<senha>@localhost:5432/consolidahub_test"   # PowerShell: $env:DATABASE_URL="..."
npm run db:migrate:deploy
npm run test:integration
```

## Princípios

* Dependências externas (Entra ID, rede) são substituídas por dublês **nos testes automatizados**;
  isso não substitui a validação real com o tenant (ver
  [pendências](../auditoria/06-pendencias-para-producao.md)).
* Tokens de teste são assinados por uma chave RSA gerada no próprio teste e validados pelo mesmo
  verificador usado em produção (não há atalho de autenticação no código da aplicação).
* Nenhum teste usa dados reais de produção.
* Não remover testes nem afrouxar asserções para "ficar verde": corrigir o código ou registrar a
  divergência.

## Cobertura funcional mínima do fluxo do MVP (e2e)

fonte → upload CSV (202) → validação assíncrona → regra criada/ativada/versionada (conflito 409) →
execução idempotente (202/200, `Idempotency-Key`) → processamento → relatório (consulta e
exportação CSV com neutralização de fórmulas e XLSX) → notificações do dono → auditoria visível só
para quem tem `audit:view`; autenticação: token forjado, expirado, de outra audiência, de outro
tenant, sem escopo, de cliente não autorizado e sem assinatura → 401; usuário novo sem papéis → 403.
