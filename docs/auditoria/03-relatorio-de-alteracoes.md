# Entregável 2 — Relatório de alterações

> Base: commit `f3d256e` (branch `dev`). Alterações na branch `refactor/consolidahub-fundacao`
> (sem commit — entregues como patch). 387 arquivos: 216 adicionados, 143 removidos, 27
> modificados, 1 movido. Referências `S*`, `D*`, `I*` remetem ao
> [estado inicial](01-estado-inicial.md). Evidências: [05](05-evidencias-de-validacao.md).

Legenda de validação: **T** = coberto por teste automatizado executado · **E** = verificado por
execução específica (SQL, compose, lint…) · **R** = revisão de código/configuração apenas.

## 1. Estrutura, build e dependências

| Problema | Causa raiz | Decisão / correção | Validação |
| --- | --- | --- | --- |
| Nenhum dos aplicativos compilava (tsconfig único com `noEmit`, `jsx`, plugin `next`; `nest` ausente) | Next.js e NestJS no mesmo pacote; scaffold de Next 16 rebaixado | API/worker em `src/` com `tsconfig.json` + `tsconfig.build.json` (NodeNext, emit em `dist/`); web em pacote próprio `web/` ([ADR-0006](../arquitetura/adr/0006-frontend-como-pacote-separado.md)); build com `tsc`; dev com `scripts/dev.mjs` (`tsc --watch` + `node --watch`, sem `@nestjs/cli`) | E (typecheck, build equivalente, teste do watcher) |
| `npm run lint` quebrado (`eslint/config` inexistente no ESLint 8) | Config do ESLint 9 com ESLint 8.57 instalado | `eslint.config.mjs` flat para ESLint 8.57 (typescript-eslint 8, `no-explicit-any`, `eqeqeq`, `no-console`); web com `next lint` + `.eslintrc.json` | E (ESLint 10 + typescript-eslint 8.60.1: 0 erros) |
| Dependências sem uso, inseguras ou conflitantes | Acúmulo de protótipos | Removidas: `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/swagger`, `passport*`, `jsonwebtoken`, `axios`, `pg`, `uuid`, `class-validator`, `class-transformer`, `opentelemetry` (pacote não oficial), `tailwindcss`, `@tailwindcss/postcss`, `@types/mocha`, `supertest`. `@types/express` movido para dev. React/Next/MSAL movidos para `web/` | R + E (typecheck sem elas) |
| `xlsx@0.18.5` vulnerável (CVE-2023-30533, CVE-2024-22363) | Linha npm abandonada pela SheetJS | `xlsx` 0.20.3 pela CDN oficial ([ADR-0007](../arquitetura/adr/0007-sheetjs-pela-cdn-oficial.md)) | R (testes XLSX executados com 0.18.5 — mesma API usada) |
| Versões flutuantes do Prisma (`^5.8`) | — | `prisma` e `@prisma/client` = `5.22.0` (versão já travada no lockfile) | R |
| `@types/node` 20 com runtime 22 | — | `@types/node` ^22.10, `engines` ≥ 22.11 < 25, `.nvmrc` | R |
| **Lockfile desatualizado** | O registro npm não estava acessível nesta sessão | `package-lock.json` **não foi regenerado** e `web/package-lock.json` não existe: passo obrigatório `npm install` (raiz e `web/`) antes do commit | — (pendência bloqueante) |

## 2. Persistência (D1–D8)

| Problema | Causa raiz | Decisão / correção | Validação |
| --- | --- | --- | --- |
| D1 migration falhava em banco vazio; schema sem migrations | Migrations nunca geradas a partir do schema | Schema revisado + migration de base única (`20261023000000_baseline`) com CHECKs e triggers; `migration_lock.toml`; script `db:migrate:check` (drift) na CI | E (aplicada em PostgreSQL 16.15 vazio; verificação estrutural schema × banco: 0 divergências) |
| D2 "versionamento" sobrescrevia a regra | Sem tabela de versões | `rules` + `rule_versions` imutável (trigger), `expectedVersion` (409), unique (`rule_id`,`version`) | T + E (UPDATE/DELETE bloqueados no banco) |
| D3 UUID obrigatório gravado como `''` | Execução sem fonte/regra reais | Execução ligada a fonte, solicitante e snapshot de entradas; FKs explícitas | T |
| D4 seis `PrismaClient` | Provider repetido por módulo | `CoreModule` global com um `PrismaService` | R |
| D5/D6 sem FKs/enums | Modelagem inicial | FKs com `ON DELETE RESTRICT/CASCADE` conforme o caso; 14 enums | E |
| D7 modelos sem requisito (`Multibase*`, `DataBase`, `Configuration*`…) | Herança do script | Removidos; fontes/cargas modeladas conforme o escopo | R |
| D8 seed inconsistente | Papéis divergentes | Seed idempotente derivado de `access-control.ts` (6 papéis, 16 permissões) | T (catálogo) |
| Erro `@prisma/client has no exported member PrismaClient` | Client nunca gerado (sem `postinstall`; Dockerfile compilava antes de gerar) | `postinstall: prisma generate` + `prisma generate` explícito no Dockerfile antes do build | R (não executável aqui: engines bloqueadas) |
| Aplicação usaria credencial administrativa | Sem papel restrito | `infra/database/app-role.sql` (papel DML, sem `TRUNCATE`/DDL/`UPDATE` em auditoria) + procedimento no deploy | E (privilégios verificados em PostgreSQL 16) |
| Uploads concorrentes do mesmo arquivo passavam na checagem de duplicidade | Verificação sem serialização | *Lock* da linha da fonte na transação de upload | T (unidade) + R |

## 3. Núcleo HTTP, erros e observabilidade (S9, S13–S15, I8)

| Problema | Correção | Validação |
| --- | --- | --- |
| S9 mensagens internas expostas | `ApiExceptionFilter`: códigos estáveis, 500 genérico, detalhe só no log com `requestId` | T (e2e) |
| S13 Swagger em produção | Removido da API (contrato servido como arquivo) | R |
| S14 `x-request-id` sem validação | Formato/tamanho validados; senão UUID gerado | T (e2e) |
| S15 e-mail em logs | Logger JSON próprio com redação (tokens, segredos, cookies, e-mail) | T (unidade) |
| Configuração não validada (`env.validation.ts` sem uso) | `loadAppConfig`: validação tipada, falha listando só nomes; regras mais estritas em produção | T |
| Helmet/CORS/limites | CSP `default-src 'none'`, CORS por lista exata, JSON 1 MB, query parser simples, `trust proxy` configurável | T (e2e) |
| Observabilidade simulada (`tracing.ts`, `TelemetryService` stubs) | Removidos os stubs (não simular); health live/ready reais. Métricas/tracing ficam como pendência | T (e2e health) |

## 4. Autenticação e autorização (S1–S8, S16)

| Problema | Correção | Validação |
| --- | --- | --- |
| S1 token aceito sem assinatura | Verificador RS256/JWKS (node:crypto) com `iss`, `aud`, `tid`, `ver`, `exp`, `nbf`, `iat`, `scp`, `azp`, `oid`; `alg` fixo; chave ≥ 2048 bits; cache JWKS com renovação limitada | T (29 casos unitários + 7 cenários e2e de tokens inválidos) |
| S2 papéis das claims | Permissões carregadas do banco a cada requisição; claims de papéis ignoradas | T |
| S3 controllers sem guard | Guards globais *deny-by-default*; política explícita por rota; rota sem política → 403 e falha do teste de contrato | T |
| S4/S5/S6 endpoints de protótipo (`sync-user`, `validate-token`, `callback`) | Removidos; só `GET /auth/me` | T (contrato) |
| S7 passport sem estratégia | passport removido | R |
| S8 identidade sem `oid` | `external_identities` (`provider`,`tenant_id`,`subject`) única; e-mail só atributo; provisionamento JIT sem papéis, seguro contra corrida | T + R |
| S16 token em `localStorage`/"colar JWT" | Web com MSAL (Auth Code + PKCE), `sessionStorage` | E (typecheck web) + R |
| Administração sem salvaguardas | Último ADMIN, auto-desativação, auto-remoção de ADMIN, só ADMIN concede ADMIN, *lock* de serialização; CLI de bootstrap auditada | T |
| Acesso a objetos por ID | IDs validados; notificações por dono (404 a terceiros) | T (e2e) |

## 5. Funcionalidades do MVP

| Área | Antes | Agora | Validação |
| --- | --- | --- | --- |
| Regras (F5) | CRUD sem versões; `applyRules` devolvia a entrada | 6 tipos portados do script M (Constante, Causante, Aritmética, Padronal, Matrix, Projeção) com parser estrito, motor determinístico e documentação de divergências ([semântica](../regras/semantica-do-motor.md)); regras nascem inativas | T (52 casos do motor/valores/parser + serviço) |
| Fontes e cargas (F6) | CRUD; loaders SQL/SharePoint com SSRF e credenciais em claro (S10, S11) | Fontes com origem, formato, colunas esperadas e metadados (credenciais recusadas); upload CSV/XLSX validado e assíncrono; conectores remotos desabilitados até existir allowlist + cofre | T + e2e |
| Execuções (F7) | `POST /executions/run` respondia 400/falhava (D3) | Fila PostgreSQL, worker, snapshot de entradas, idempotência, progresso, logs, cancelamento cooperativo, reprocessamento, relatório atômico | T + E (SQL da fila) |
| Relatório (F8) | Vazio gravado como `COMPLETED`, sem exportação | Consulta paginada; exportação CSV (neutralização de fórmulas) e XLSX auditada | T (e2e) |
| Notificações (F9) | Inexistentes | In-app para cargas validadas/rejeitadas e execuções concluídas/falhas; leitura individual e em lote | T (e2e) |
| Auditoria (F10) | `AuditService` nunca chamado | Eventos na mesma transação de cada mutação + negações de acesso; consulta por `audit:view`; tabela somente-inclusão | T + E |

## 6. Contrato OpenAPI (F11)

Contrato multiarquivo inválido (37 erros) e divergente (32 operações sem implementação, login
por senha) substituído por `contracts/openapi.yaml` único, 40 operações, gerado a partir da
implementação, com `x-required-permissions`. Teste de contrato na suíte padrão.
Validação: T (6 testes) + E (auditoria estática: 0 erros, 0 avisos).

## 7. Frontend (F12)

Telas do fluxo do MVP em `web/` (início, bases e cargas, regras e versões com modelos de
definição, execuções com acompanhamento e cancelamento/reprocessamento, relatórios com
exportação, notificações, usuários e auditoria), cliente tipado do envelope, controle de
interface por permissão (a API continua decidindo). Validação: E (typecheck contra React 18 e
MSAL reais com *stub* da API do Next; lint aproximado: react-hooks 4.5 + regras de JSX) — **build
do Next não executado**.

## 8. Infraestrutura e CI/CD (I1–I7, S12)

| Problema | Correção | Validação |
| --- | --- | --- |
| I1 Dockerfile quebrado | Multi-stage (deps+generate → build → prod-deps → runtime/migrator), usuário `node`, `tini`, OpenSSL p/ Prisma, healthcheck, sem scripts de instalação | R (build de imagem não executado) |
| I2 Compose inválido e exposto | `docker-compose.yml` na raiz: Postgres só em 127.0.0.1, variáveis obrigatórias com mensagem, migração como serviço único, FS somente-leitura, `no-new-privileges`, healthchecks de API e worker; sem pgAdmin/Redis/`:latest` | E (`docker compose config`) |
| I3 Terraform com Single Server aposentado, regra 0.0.0.0, Redis sem uso | Terraform novo: Container Apps + Flexible Server privado + Key Vault + ACR + identidade gerenciada; imagens ignoradas após a criação (deploy pelo pipeline) | E (sintaxe HCL e referências) — `terraform validate/plan` não executados |
| I4–I6 Kubernetes quebrado (overlay inexistente, RBAC inválido, NetworkPolicy bloqueando Entra, Secret versionado) | Manifestos removidos; decisão por Container Apps ([ADR-0004](../arquitetura/adr/0004-azure-container-apps.md)) | R |
| I7 CI só em `main`, sem typecheck/testes/migrations | `ci.yml` (API, banco com migrations + drift + integração, web, imagens com Trivy, revisão de dependências), `codeql.yml`, `deploy.yml` manual por ambiente com OIDC e tags imutáveis; todas as actions fixadas por SHA | E (YAML válido; 0 actions sem SHA) — workflows não executados |
| Worker sem liveness útil | Heartbeat também durante jobs longos + endpoint `GET /health/live` opcional; probe no Container Apps | T (unidade) |

## 9. Testes

Testes herdados removidos por validarem comportamento inexistente ou proibido (login por senha,
tautologias, `beforeAll` lançando erro). Nova suíte: 201 unitários, 6 de contrato, 22 e2e
(executados) e 2 arquivos de integração com PostgreSQL (escritos e tipados, **não executados** —
engines do Prisma indisponíveis nesta sessão). Jest separado por projeto (`unit`, `contract`,
`e2e`, `integration`).

## 10. Ajustes da etapa final de validação

Encontrados ao executar o lint e a revisão nesta etapa e corrigidos na causa:

* `no-control-regex` (2): regex com caracteres de controle em validação de texto e saneamento de
  nomes de arquivo → helpers por *code point* (`src/shared/domain/text.ts`), limite por *code
  point* no nome do arquivo (coerente com `VARCHAR(255)`), testes novos.
* `no-irregular-whitespace` (2): espaço não separável literal em regex do motor → ` `.
* `no-explicit-any` (2) nos testes → tipos explícitos do envelope e do documento OpenAPI.
* `react-hooks/exhaustive-deps` (1) na tela de execução → dependências estáveis explícitas.
* Healthcheck do worker reprovaria execuções longas (arquivo só era tocado entre jobs) → corrigido.
* Chaves de metadados `pwd`/`connectionString` não eram recusadas → padrão ampliado + teste.
* Terraform reverteria a imagem publicada pelo pipeline a cada `apply` → `ignore_changes`.

## 11. Correções da revisão independente (Fase G)

Detalhes e evidências em [08-revisao-final.md](08-revisao-final.md). Resumo:

| Achado | Correção | Validação |
| --- | --- | --- |
| XLSX com > 125 mil linhas falhava; intervalo declarado gigante esgotava memória | `xlsx.reader.ts`: largura por células com valor, sem *spread*; só ZIP | T (4 testes, inclusive 130 mil linhas) + E (arquivo de ataque: OOM → `TOO_MANY_COLUMNS` em 175 ms) |
| XLSX de relatório montado em memória sem limite | `REPORT_XLSX_MAX_CELLS` → `422 EXPORT_TOO_LARGE` | T + E (medição de custo por célula) |
| CSV truncado entregue como completo | `abortOnStreamError` (conexão destruída; 500 genérico antes dos cabeçalhos) + aviso no web | T (e2e com falha simulada) |
| Autoconcessão de papéis por `users:manage`; papéis antigos do executor | `CANNOT_CHANGE_OWN_ROLES`; papéis/status relidos sob *lock* | T |
| Identidade única lia a credencial de migração; segredo da app com admin | Identidades separadas, RBAC por segredo, segredo inválido de início, recusa de iniciar com o papel dono | E (Terraform: sintaxe/referências; SQL do teste de dono em PostgreSQL) |
| `LOOKUP` multiplicava linhas antes de checar o limite | Limite verificado durante a junção | T |
| Worker sem lease sobrescrevia o novo dono | `finish` cercado por `locked_by` | Teste de integração escrito (não executado aqui) |
| CSV sem aspas para `,` | Aspas em `; , TAB`, aspas e quebras | T |
| `/health/ready` sem custo limitado | `CachedCheck` (`HEALTH_READY_CACHE_MS`) | T |
| Auditoria de provisionamento fora da transação; status da fonte antes do *lock* | Mesma transação; releitura sob *lock* | T |
| `app-role.sql` dependia do nome do banco e de `_prisma_migrations` | `current_database()` e revogação condicional | E (2 bancos novos, 2 execuções cada) |

## 12. Documentação (F14)

`README.md` e `AGENTS.md` reescritos (o anterior era o *boilerplate* do Next 16 e referia
documentação inexistente); `docs/ARCHITECTURE.md` (com artefato `*** End Patch`) substituído por
`docs/arquitetura/` (visão geral, autenticação, segurança, processamento, 8 ADRs),
`docs/regras/semantica-do-motor.md`, `docs/guias/` (ambiente local, banco, testes, contrato,
deploy, operação) e estes relatórios.
