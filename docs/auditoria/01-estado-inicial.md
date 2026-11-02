# Entregável 1 — Relatório do estado inicial

> Auditoria técnica realizada em 23/10/2026 sobre o commit `f3d256e` da branch `dev`
> (`origin/dev`, árvore de trabalho local limpa e idêntica ao remoto — verificado arquivo a arquivo).
> Todas as evidências citam arquivo e linha do estado **anterior** às correções.
> Defeitos marcados como **[comprovado]** foram reproduzidos por execução ou são inequívocos
> pela leitura do código; itens marcados como **[risco]** dependem de condições externas ainda
> não observadas.

## 1. Fontes de verdade consultadas

| Fonte | Situação |
| --- | --- |
| `CLAUDE.md` | Contém apenas `@AGENTS.md`. |
| `AGENTS.md` | Texto padrão do `create-next-app` 16 ("This is NOT the Next.js you know"), incompatível com o Next 14 instalado. Não há regras do projeto nem do AI-Harness. |
| `README.md`, `docs/ARCHITECTURE.md` | Descrevem módulos "scaffolded"; `ARCHITECTURE.md` termina com o artefato `*** End Patch` (patch de IA aplicado sem revisão). |
| `contracts/openapi/openapi.yaml` + `schemas/*.yaml` | Contrato OpenAPI 3.1 multiarquivo (49 operações). Ver seção 6. |
| Documentos do Projeto (claude.ai) | `Consolida-Escopo.md` (escopo/arquitetura) e `ScriptAntigo_RelatórioConsolidado.txt` (implementação original em Power Query M). |
| Histórico Git | `ENTRA_ID_SETUP.md`, `SECURITY.md`, `SECURITY_ENVIRONMENTS.md`, `MIGRATION_GUIDE.md` e `infra/README.md` existiram e foram removidos nos commits `eca7495`/`e52906b`. O `ENTRA_ID_SETUP.md` registra decisões do Passo 7 (papéis, formato `resource:action` das permissões, audiência `api://…`, papéis **não** sincronizados do Entra). Essas decisões foram consideradas aprovadas. |

## 2. AI-Harness

* Localização real: `C:\Users\Particular\Projetos\ai-harness` (pacote Python `ai-harness` 0.1.0, MIT).
  O diretório tem `.git` **sem nenhum commit** (sem `index` nem `refs/heads`): todo o conteúdo está não versionado.
* Componentes: `core.py` (estados de execução), `policies.py` (política de ferramentas com aprovação),
  `runtime.py` (`Harness`, `SimulatedProvider`, SQLite), `integrations.py` (contratos MCP/agentes/plataformas),
  `maestro.py` (planejamento, delegação, consolidação), `cli.py`.
* Evidência de execução nesta sessão:
  * `pytest` → **58 passed** (cópia isolada do repositório; Python 3.13, pydantic 2.13.5).
  * `python -m ai_harness --db <tmp> maestro run --approve "Auditoria técnica do ConsolidaHub…"` →
    `state: completed`, `"mode": "simulated"`, resumo de cada agente:
    *"Simulated analyst completed its assigned work; no real model or external service was used."*
* Conclusões **[comprovado]**:
  * Só existem agentes `analyst` e `reviewer` com `provider="simulated"`; `load_simulated_agent_registry`
    recusa qualquer outro provider (`maestro.py:1153-1156`).
  * O planejador padrão ignora a solicitação (`_ = user_request`, `maestro.py:1190`) e sempre cria as
    mesmas duas tarefas genéricas.
  * Não há servidor MCP nem integração com Claude Code: a única interface é a CLI/biblioteca local.
  * Portanto o harness **não pode** produzir análise, implementação ou revisão reais. Nenhum resultado
    deste trabalho é atribuído a ele. A menor implementação necessária para torná-lo útil está descrita em
    `docs/auditoria/07-proximas-acoes.md`.

## 3. Ambiente desta sessão (limitações que afetam as evidências)

| Recurso | Situação |
| --- | --- |
| npm registry (`registry.npmjs.org`) | **Bloqueado** pelo proxy (HTTP 403). Impossível `npm ci`/`npm install`. |
| PyPI, `binaries.prisma.sh`, `cdn.sheetjs.com` | **Bloqueados** (HTTP 403). |
| GitHub | Acessível (clone do repositório para histórico). |
| Node.js 22.22, TypeScript global 6.0.3 | Disponíveis (o projeto trava TypeScript 5.9.3). |
| PostgreSQL 16.15 local | Disponível — usado para validar migrations. |
| Docker CLI + Compose v5.6 | Disponíveis para `docker compose config` (sem daemon). |
| Máquina do usuário | Acesso somente a arquivos (sem shell): a validação final com dependências precisa ser executada pelo usuário ou pela CI. |

## 4. Inventário técnico

### 4.1 Stack declarada x instalada (lockfile v3)

| Pacote | `package.json` | Lock | Observação |
| --- | --- | --- | --- |
| `@nestjs/*` | ^10.3 | 10.4.22 | `@nestjs/jwt` ^11 com Nest 10. |
| `@nestjs/cli` | **ausente** | — | Scripts `dev`/`build` chamam `nest` → falham. |
| `prisma` / `@prisma/client` | ^5.8 | 5.22.0 | Versões coerentes entre si; **sem** `postinstall`/geração. |
| `next` / `react` | ^14 / ^18 | 14.2.35 / 18.3.1 | O commit inicial era Next 16.2.6 + React 19 + ESLint 9 + Tailwind 4; foi rebaixado mantendo arquivos do Next 16. |
| `eslint` / `eslint-config-next` | ^8.55 / ^14 | 8.57.1 / 14.2.35 | `eslint.config.mjs` importa `eslint/config` (só existe no ESLint ≥ 9.22) → `npm run lint` quebra. |
| `tailwindcss` / `@tailwindcss/postcss` | ^3.4 / ^4 | 3.4.19 / 4.3.0 | Versões incompatíveis; o CSS não usa Tailwind. |
| `opentelemetry` | ^0.1.0 | 0.1.0 | Pacote **não oficial** e sem relação com `@opentelemetry/*` (risco de supply chain); não é usado. |
| `xlsx` | ^0.18.5 | 0.18.5 | Vulnerável a CVE-2023-30533 (prototype pollution, corrigido em 0.19.3) e CVE-2024-22363 (ReDoS, corrigido em 0.20.2). A SheetJS não publica versões corrigidas no npm. |
| `@types/mocha` + `@types/jest` | dev | — | Declarações globais conflitantes (`describe`, `it`). |
| `@types/express` | **dependencies** | — | Tipo em dependência de produção. |
| `uuid`, `pg` | — | — | Tipados por *shims* manuais (`src/types/*.d.ts`) que escondem a falta de `@types/*`. |

### 4.2 Estrutura real

* Um único `package.json` mistura **Next.js** (`src/app/**`) e **NestJS** (`src/main.ts`, `src/modules/**`) com
  **um único** `tsconfig.json` (`noEmit: true`, `jsx: preserve`, `isolatedModules`, `allowImportingTsExtensions`,
  `module: commonjs`, plugin `next`). Com `noEmit`, `nest build`/`tsc` não geram `dist/` → **nenhum dos dois
  aplicativos compila com essa configuração [comprovado por leitura da configuração]**.
* `next.config.mjs` **e** `next.config.ts` coexistem (o Next 14 ignora o `.ts`).
* Módulos Nest: `auth`, `rules`, `sources`, `executions`, `loaders`, `reports`. **Inexistentes**: `users`,
  `permissions`, `notifications`, `audit` (há apenas `AuditService` solto em `src/audit`).
* Guards duplicados: `src/common/guards/*` e `src/modules/auth/presentation/guards/*`.
* Código de exemplo em caminho de produção: `src/common/examples/object-level-authorization.example.ts`.

### 4.3 Estado inicial das verificações

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Instalação | `npm ci` | **Bloqueado** (registry 403). Mesmo com acesso, `npm run build` falharia: `nest` não está instalado. |
| Prisma | `prisma validate` / `generate` | **Bloqueado** (CLI e engines indisponíveis). Sem client gerado, todo acesso a `PrismaService` é erro de tipo — origem do erro "`@prisma/client` has no exported member `PrismaClient`". |
| Migrations | `psql --single-transaction -f prisma/migrations/001_create_audit_logs/migration.sql` em banco vazio (PostgreSQL 16) | **Falhou**: `ERROR: relation "users" does not exist` (linha 41). Não existe `migration_lock.toml`; o schema tem 16 modelos e a única migration cria só `audit_logs`. |
| Typecheck | `tsc -p tsconfig.json --noEmit` (TS 6.0.3 global) | Falha imediata `TS5107` (`moduleResolution=node10` obsoleto no TS 6). Ignorando a obsolescência: **511 erros** (135 × módulos ausentes, 189 × JSX sem tipos, 54 × propriedades inexistentes no `PrismaService`, etc.). Não representativo sem dependências, mas confirma que nada foi gerado. |
| Lint | `npm run lint` | Não executado (dependências); quebraria por `eslint/config` inexistente no ESLint 8. |
| Testes | `jest` | Não executado (dependências). Ver análise estática na seção 9. |
| Compose | `docker compose -f infra/docker/docker-compose.yml config` | **Falhou**: `env file …/.env not found`. Atributo `version` obsoleto. |
| Contrato | auditoria estática do OpenAPI (script Python) | **37 erros**: 1 YAML inválido (`schemas/sources.yaml:70`), 19 `$ref` quebradas, 17 usos de `nullable` (inválido em 3.1); 91 avisos. |
| Contrato x código | inventário de rotas via AST TypeScript | 26 rotas implementadas, 49 operações no contrato, **17 coincidentes**; 9 rotas fora do contrato e 32 operações sem implementação. |

## 5. Segurança, autenticação e autorização

| # | Sev. | Problema | Evidência | Impacto | Causa provável | Correção |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | **P0** | Token Entra aceito **sem verificação de assinatura** [comprovado] | `entra-token-validator.provider.ts:36-63` decodifica o payload em base64; `TODO: Implement actual JWT validation` | Qualquer pessoa forja um token com `iss`/`aud` esperados (ou qualquer `iss` se `ENTRA_ISSUER` não estiver definido) → autenticação inexistente | Placeholder nunca substituído | Validar RS256 com JWKS do tenant, `iss`, `aud`, `tid`, `exp`, `nbf`, `ver`; rejeitar `alg` diferente |
| S2 | **P0** | `request.user` recebe as **claims do token**, inclusive `roles`/`permissions` enviadas pelo cliente [comprovado] | `presentation/guards/jwt-auth.guard.ts:25-26`, `permissions.guard.ts:22-29` | Combinado com S1: escalonamento de privilégio arbitrário | Ausência de separação identidade × autorização | Carregar papéis/permissões do banco a partir da identidade local |
| S3 | **P0** | Controllers de regras, fontes, execuções e relatórios **sem guard** [comprovado] | `rules.controller.ts:33-36`, `sources.controller.ts:14-17`, `executions.controller.ts:9-12`, `reports.controller.ts:13-16` (só `@ApiBearerAuth`, que é documentação) | API inteira pública | Guards nunca aplicados; não há guard global | Guard global *deny-by-default* + `@Public()` explícito |
| S4 | **P0** | `POST /auth/sync-user` público e sem validação cria/atualiza usuários [comprovado] | `auth.controller.ts:54-70` (`@SkipThrottle`, corpo tipado inline) | Criação/sequestro de contas; casamento por **e-mail** primeiro (`sync-local-user.use-case.ts:18-22`) | Endpoint de protótipo | Remover; provisionamento JIT apenas a partir de token validado, chave (`tid`,`oid`) |
| S5 | P1 | `POST /auth/validate-token` devolve claims de qualquer token e ecoa a mensagem de erro | `auth.controller.ts:47-52`, `entra-token-validator.provider.ts:66-68` | Oráculo de validação, vazamento de detalhes | Protótipo | Remover |
| S6 | P1 | `POST /auth/callback` ecoa o *authorization code* | `auth.controller.ts:35-45` | Vazamento de credencial temporária | Protótipo | Remover (fluxo OAuth é do cliente via MSAL) |
| S7 | P1 | Guard `common/guards/jwt-auth.guard.ts` usa `AuthGuard('jwt')` sem estratégia registrada | arquivo inteiro; nenhum `PassportStrategy` | Qualquer rota que o use responde 500 | Código duplicado/abandonado | Remover passport |
| S8 | P1 | Identidade local não persiste `oid`/`sub` | `prisma-auth.repository.ts:40,69,80-88` (`entraSub: ''`, `TODO`) | Usuário trocado de e-mail perde vínculo; dois usuários podem colidir | Implementação incompleta | Tabela `external_identities` com único (`provider`,`tenant_id`,`subject`) |
| S9 | P1 | Exceções não HTTP devolvem `exception.message` ao cliente | `all-exceptions.filter.ts:56-58` | Vazamento de SQL/estrutura interna (mensagens do Prisma) | Tratamento genérico | Mensagem genérica + log estruturado com `requestId` |
| S10 | P1 | SSRF/acesso arbitrário: `source.config` controla host/URL consultados pelo servidor | `sql-loader.service.ts:12-31`, `sharepoint-loader.service.ts:15-23`, `run-execution.use-case.ts:61-69` | Conexão a hosts internos arbitrários a partir do servidor | Conectores sem allowlist | Conectores remotos desabilitados até existir allowlist e credencial por referência |
| S11 | P1 | Credenciais em texto puro em `Source.config` e devolvidas no GET | `create-source.dto.ts:20-22`, `prisma-sources.repository.ts:111`; fixture `sql-source.json` com `password` | Exposição de segredos via API e banco | Modelo sem separação de segredo | Proibir segredos em `config`; somente referência a cofre (`credentialRef`) |
| S12 | P1 | `Secret` do Kubernetes versionado com placeholders | `infra/k8s/base/secret.yaml` | `kubectl apply -k` sobrescreve segredos reais com placeholders → indisponibilidade | Padrão de exemplo em base | Remover do kustomize; usar Key Vault/External Secrets |
| S13 | P2 | Swagger exposto em produção | `main.ts:77-78` | Superfície de reconhecimento | — | Habilitar só fora de produção |
| S14 | P2 | `x-request-id` do cliente aceito sem validação | `request-context.middleware.ts:11-12` | Poluição de logs/correlação | — | Validar formato/tamanho |
| S15 | P2 | E-mail (PII) gravado em todas as linhas de log | `structured-logger.service.ts:37` | Exposição de dados pessoais em logs | — | Não registrar e-mail; redigir campos sensíveis |
| S16 | P2 | Token guardado em `localStorage` e login por "colar JWT" | `src/app/lib/api.ts:8,21`, `src/app/login/page.tsx:43-51` | Roubo por XSS; não há login corporativo real | Demonstração | MSAL (Authorization Code + PKCE), cache em `sessionStorage` |
| S17 | P2 | Rate limit apenas em memória por instância | `app.module.ts:23-34` | Limites multiplicados por réplica | Aceitável no MVP | Documentar; Redis/ingress quando houver múltiplas réplicas |

## 6. Contrato OpenAPI

* **[comprovado]** `schemas/sources.yaml:70` não é YAML válido (`ex: conexão` sem aspas) → nenhuma ferramenta carrega o contrato.
* **[comprovado]** 19 `$ref` quebradas: arquivos externos referenciam `#/components/schemas/...`, que não existe dentro deles.
* **[comprovado]** 17 ocorrências de `nullable` (palavra-chave do OpenAPI 3.0, inválida em 3.1).
* Conflito com requisito aprovado: `/auth/login` com e-mail+senha, `/auth/refresh`, `/users/{id}/change-password`
  e `password` em `CreateUserRequest` contrariam o login corporativo via Entra ID (não armazenar senha corporativa).
* Vocabulários divergentes: papéis (`auth.yaml`: 6 papéis do Passo 7; `users.yaml`: `ADMIN/MANAGER/ANALYST/VIEWER`;
  seed: `ADMIN/MANAGER/USER/VIEWER`); permissões (`rules:create` × `RULE_CREATE`); tipos de fonte
  (`CSV/XLSX/DATABASE/API` no contrato, `excel/sql/sharepoint` no código, `EXCEL/SQL/SHAREPOINT` no frontend);
  status de execução (`SUCCESS` × `COMPLETED`).
* Fora do MVP: agendamento de relatórios, preferências de notificação, relatórios PDF com gráficos.
* Relatórios editáveis/excluíveis (`PATCH`/`DELETE /reports/{id}`) contrariam rastreabilidade.

## 7. Persistência (Prisma/PostgreSQL)

| # | Sev. | Problema | Evidência | Correção |
| --- | --- | --- | --- | --- |
| D1 | **P1** | Migrations não recriam o schema; a única migration falha em banco vazio [comprovado] | ver 4.3 | Migration de base única coerente com o schema + verificação de *drift* na CI |
| D2 | **P1** | "Versionamento" de regras sobrescreve a linha e incrementa `version`; `findVersions` consulta `where: { id }` (no máximo 1 linha) [comprovado] | `update-rule.use-case.ts:45-48`, `prisma-rules.repository.ts:155-166` | Tabela imutável `rule_versions` + controle otimista de concorrência |
| D3 | **P1** | `Execution.ruleId/sourceId` são UUID obrigatórios e o código grava `''` [comprovado] | `schema.prisma:356-357`, `run-execution.use-case.ts:30-37` | Postgres rejeita `''` como UUID → toda execução falha antes de começar |
| D4 | P1 | Seis instâncias de `PrismaClient` (provider repetido em `AppModule` + 5 módulos) | `auth.module.ts:45`, `rules.module.ts:37`, `sources.module.ts:31`, `executions.module.ts:11`, `reports.module.ts:19`, `app.module.ts:48` | Um `PrismaModule` global |
| D5 | P2 | Sem integridade referencial em `sourceIds String[]`, `Execution`, `Report`, `Notification` | `schema.prisma` | FKs explícitas |
| D6 | P2 | Status como texto livre, sem enums | `schema.prisma` | Enums Prisma |
| D7 | P2 | Modelos sem uso nem requisito (`Multibase1`, `MultibaseX`, `DataBase`, `DataTable`, `Phase`, `Configuration*`) | `schema.prisma:233-350` | Remover; modelar fontes/cargas conforme o escopo |
| D8 | P2 | Seed inconsistente (papéis e formato de permissões) e sem `prisma.seed` no `package.json` | `prisma/seed.ts`, `package.json` | Seed idempotente alinhado às decisões do Passo 7 |

## 8. Fluxo funcional (o que realmente funciona)

| Etapa do fluxo-alvo | Estado |
| --- | --- |
| 1. Autenticação corporativa | **Inexistente** (S1–S4). Frontend pede para colar um JWT. |
| 2. Identificação do usuário local e permissões | Defeituoso (S2, S8; `build-session.use-case.ts:15` passa o *id* como e-mail). |
| 3. Registro/importação de base | CRUD de `Source` apenas; **nenhuma importação** de dados. |
| 4. Validação/rastreio da importação | Inexistente. |
| 5. Aplicação de regras | `RuleApplierService.applyRules` devolve a entrada (`rule-applier.service.ts:8-11`). |
| 6. Registro da execução | `RunExecutionDto` não tem decorators e o `ValidationPipe` usa `forbidNonWhitelisted` → `POST /executions/run` responde 400 para qualquer corpo com `configurationId`; mesmo passando, D3 faz a execução falhar; loaders são chamados com argumentos fictícios (`'path-or-buffer'`, `'SELECT 1'`). |
| 7. Relatório Consolidado | Relatório vazio gravado como `COMPLETED`. |
| 8. Consulta/exportação | Listagem sem paginação válida (`QueryReportsDto` sem decorators → 400); sem exportação. |
| 9. Auditoria | `AuditService` existe mas **nunca é chamado**; engole erros com `console.error`. |
| Notificações | Inexistentes (só o modelo). |

Comparação com o script Power Query M (referência funcional): o script implementa seis categorias de lógica
(Constante, Causante, Aritmética, Padronal, Matrix, Variável), normalização de nomes de colunas, contexto por
Parâmetro/Fase/Fornecedor/Empresa/Aba e logs por etapa. **Nenhuma** delas existe no TypeScript. Foram
identificados defeitos latentes no próprio script: `ApplyAritimetico` chama `Rules[Operacao]` com 4 argumentos
para uma função de 5 parâmetros obrigatórios, e `ApplyPadronal` referencia `Rules[Indexação]`, que não existe
(exporta-se `Indexacao`); o `try … otherwise state` torna o modo "index" um no-op silencioso.

## 9. Testes existentes

* `test/integration/auth.integration.spec.ts:47-49` redefine `beforeAll` lançando `Function not implemented` e
  os casos são tautologias (`expect(user.email).toContain('@')`).
* `test/e2e/auth.e2e.spec.ts` espera login com senha e `access_token` — comportamento inexistente e proibido.
* `test/e2e/rules.e2e.spec.ts` usa `PUT` (não existe), id `1` (não é UUID) e espera 200 em `DELETE` (204).
* `jest.config.js` (`rootDir: src` + `roots: ../test`) inclui os e2e na execução unitária.
* Os testes unitários restantes validam placeholders (`rule-applier.spec.ts` confirma que nada é aplicado).

## 10. Infraestrutura e CI/CD

| # | Sev. | Problema | Evidência |
| --- | --- | --- | --- |
| I1 | P1 | Dockerfile compila antes de gerar o Prisma Client e chama `nest` inexistente; `--only=production` obsoleto | `Dockerfile:18-21,32` |
| I2 | P1 | Compose exige `.env` inexistente (e `.gitignore` com `.env*` impede versionar `.env.example`); monta `init-db.sql` inexistente; expõe Postgres/Redis em todas as interfaces com senhas padrão; `pgadmin` `admin/admin`; imagens `:latest`; collector exporta para `jaeger` não definido | `infra/docker/docker-compose.yml`, `.gitignore:34` |
| I3 | P1 | Terraform usa `azurerm_postgresql_server` (Single Server, aposentado em 28/03/2025); regra `0.0.0.0` "AllowAzureServices" contradiz `public_network_access_enabled = false`; *vnet rule* sem *service endpoint*; Redis sem uso pela aplicação | `infra/terraform/modules/database/main.tf`, `modules/redis/main.tf` |
| I4 | P1 | `overlays/prod` referencia `ingress-patch.yaml` inexistente; `deploy-hml.yml` aplica `overlays/hml` inexistente | `overlays/prod/kustomization.yaml:39`, `.github/workflows/deploy-hml.yml:23` |
| I5 | P1 | NetworkPolicy bloqueia saída para a internet (`namespaceSelector: {}` só seleciona pods) → JWKS do Entra inacessível | `infra/k8s/base/networkpolicy.yaml:49-54` |
| I6 | P2 | `Role` RBAC com `verbs: []` (inválido); `probes.yaml` é um Pod de exemplo no namespace `default`; imagem `:latest` + `imagePullPolicy: Always`; anotação Prometheus sem endpoint `/metrics` | `infra/k8s/base/*` |
| I7 | P2 | CI roda só em `main` (branch ativa é `dev`), sem typecheck, sem testes de integração, sem verificação de migrations/contrato; deploys com autenticação `echo "configure…"` | `.github/workflows/*.yml` |
| I8 | P2 | Observabilidade simulada: `tracing.ts` e `TelemetryService` são stubs; `env.validation.ts` existe mas não é usado | `src/infrastructure/observability/tracing.ts`, `src/observability/telemetry.service.ts:8-16`, `app.module.ts:22` |

## 11. Segredos

Varredura por padrões de chaves, tokens e senhas no repositório: **nenhum segredo real encontrado**. Há apenas
placeholders (`secret.yaml` decodifica para `your-client-secret`, etc.) e senhas fictícias em testes.

## 12. Decisões que precisam de confirmação do negócio

1. Semântica de comparação de valores (o M compara sem conversão de tipo; a nova versão usa `auto`/`texto`/`número` explícitos).
2. Especificação da lógica **Variável** (alocação com tolerância/câmbio "LOCATION") antes de portar.
3. Matriz papel × permissão proposta (seção 3 de `docs/arquitetura/seguranca.md`).
4. Plataforma de execução em nuvem (Azure Container Apps recomendado × AKS existente).
5. Limites operacionais de importação (tamanho de arquivo, linhas) e retenção de auditoria.
