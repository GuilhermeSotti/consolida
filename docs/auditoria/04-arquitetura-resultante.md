# Entregável 3 — Arquitetura resultante

Resumo executivo; o detalhamento vivo está em [`docs/arquitetura/`](../arquitetura/visao-geral.md).

## 1. Camadas

| Camada | Responsabilidade | Depende de |
| --- | --- | --- |
| `domain` | Regras puras: motor de regras, máquina de estados da execução, normalização de cargas, catálogo de acesso | nada (sem framework) |
| `application` | Casos de uso e **portas** (repositórios, fila, auditoria, notificações, transações, relógio) | `domain` |
| `infrastructure` | Adaptadores: Prisma, verificador de tokens Entra, parsers CSV/XLSX, fila, logger | `application` (implementa portas) |
| `presentation` | Controllers Nest, parsers de requisição, envelope, filtro de exceções, guards | `application` |

Os casos de uso recebem dependências por construtor via *tokens* (`useFactory`), o que permite
testes com *fakes* e a reutilização pelo worker (`*CoreModule`).

## 2. Módulos

`auth` (token, identidade, guards) · `users` (usuários, papéis) · `sources` (bases, cargas,
parsers) · `rules` (regras, versões, motor) · `executions` (solicitação, snapshot, runner) ·
`reports` (consulta, exportação) · `notifications` · `audit` (consulta) · `health`. Núcleo
compartilhado em `src/shared` (erros, paginação, validação, Prisma, fila, auditoria, logs,
contexto de requisição).

## 3. Fluxo de autenticação

SPA (MSAL, Auth Code + PKCE) → access token v2.0 com escopo `access_as_user` → API valida
assinatura RS256 (JWKS do tenant) e claims (`iss`, `aud`, `tid`, `ver`, `exp/nbf/iat`, `scp`,
`azp`, `oid`) → identidade (`entra-id`, `tid`, `oid`) → usuário local (JIT sem papéis) → papéis e
permissões do banco → `AuthorizationGuard` (*deny-by-default*). Primeiro administrador por CLI
auditada. Detalhes: [autenticacao.md](../arquitetura/autenticacao.md).

## 4. Persistência

PostgreSQL 16 via Prisma 5.22; migration de base versionada + triggers de imutabilidade
(auditoria, versões de regra); dados tabulares em blocos JSONB; arquivo original em bytea; papel
de aplicação só com DML. Detalhes: [banco-de-dados.md](../guias/banco-de-dados.md),
[ADR-0008](../arquitetura/adr/0008-arquivos-e-dados-tabulares-no-postgresql.md).

## 5. Processamento e geração de relatórios

Upload → carga `RECEIVED` + job (1 transação) → worker valida e grava linhas + `VALIDATED`
(1 transação) → execução solicitada com `Idempotency-Key` fixa carga e versões de regra →
worker aplica o motor (logs/progresso/cancelamento) → relatório + `SUCCEEDED` + notificação +
auditoria (1 transação) → consulta paginada e exportação CSV/XLSX. Fila em PostgreSQL com
`SKIP LOCKED`, *lease*, retentativas e desligamento gracioso. Detalhes:
[processamento.md](../arquitetura/processamento.md).

## 6. Auditoria e observabilidade

Auditoria transacional e somente-inclusão (inclui negações de acesso e exportações); logs JSON com
`requestId` e redação; health live/ready da API; liveness do worker (heartbeat + HTTP). Métricas,
tracing e alertas: **não implementados** (pendência).

## 7. Infraestrutura local e estratégia de nuvem

* Local: Docker Compose (PostgreSQL em 127.0.0.1, migração, API, worker, web; contêineres
  somente-leitura e sem privilégios extras).
* Nuvem (proposta, não provisionada): Azure Container Apps + PostgreSQL Flexible Server privado +
  Key Vault + ACR + identidade gerenciada, via Terraform e GitHub Actions com OIDC.
* **Kubernetes não é necessário no MVP**: três contêineres sem estado e um job não justificam
  operar um cluster (ingress, certificados, nós, políticas). Container Apps entrega escala,
  revisões, probes, identidade gerenciada e integração com VNet com menos operação. A decisão é
  reversível: as imagens e a configuração por ambiente não dependem da plataforma
  ([ADR-0004](../arquitetura/adr/0004-azure-container-apps.md)). O provedor Azure foi **inferido**
  do repositório e do Entra ID — confirmar.

## 8. Integração com o contrato OpenAPI

`contracts/openapi.yaml` (3.1) é a fonte única; o teste de contrato compara rotas, status de
sucesso, permissões e rotas públicas com os controllers e valida o documento. Clientes futuros
(desktop/móvel) consomem o mesmo contrato; a API não depende do web
([ADR-0003](../arquitetura/adr/0003-contrato-openapi-unico.md)).
