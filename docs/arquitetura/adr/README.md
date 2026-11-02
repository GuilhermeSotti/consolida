# Registros de decisão de arquitetura (ADR)

| ADR | Decisão | Status |
| --- | --- | --- |
| [0001](0001-monolito-modular-api-e-worker.md) | Monólito modular NestJS com processos API e worker | Aceita |
| [0002](0002-fila-de-jobs-no-postgresql.md) | Fila de jobs no PostgreSQL (`FOR UPDATE SKIP LOCKED`), sem Redis/broker | Aceita |
| [0003](0003-contrato-openapi-unico.md) | Contrato OpenAPI 3.1 único, verificado por teste | Aceita |
| [0004](0004-azure-container-apps.md) | Azure Container Apps em vez de AKS no MVP | Proposta — confirmar com a plataforma |
| [0005](0005-identidade-entra-id-e-rbac-local.md) | Identidade Entra ID (`tid`,`oid`) e RBAC local | Aceita (Passo 7) |
| [0006](0006-frontend-como-pacote-separado.md) | Frontend Next.js como pacote npm separado (`web/`) | Aceita |
| [0007](0007-sheetjs-pela-cdn-oficial.md) | SheetJS CE 0.20.3 pela CDN oficial | Aceita |
| [0008](0008-arquivos-e-dados-tabulares-no-postgresql.md) | Arquivos enviados e dados tabulares no PostgreSQL | Aceita para o MVP |

Formato: contexto → decisão → alternativas consideradas → consequências. Uma decisão substituída
recebe status "Substituída por ADR-XXXX" e não é apagada.
