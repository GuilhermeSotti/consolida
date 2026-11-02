# Plano de correção priorizado (Fase C)

Prioridades: **P0** crítico (segurança/perda de dados/bloqueio total), **P1** alto (build, persistência,
autorização, fluxo central), **P2** médio (arquitetura, testes, operação), **P3** baixo (refinamentos).

## Sequência e dependências

| Etapa | Escopo | Itens do diagnóstico | Prioridade | Depende de |
| --- | --- | --- | --- | --- |
| F1 | Fundação de build: separar API (`src/`) e Web (`web/`), `tsconfig` por alvo, scripts sem `@nestjs/cli`, ESLint compatível com a versão travada, Jest unitário/integração/e2e separados, limpeza de dependências | 4.1, 4.2, I1 | P1 | — |
| F2 | Persistência: schema Prisma revisado, migration de base validada em PostgreSQL, seed idempotente, `PrismaModule` global | D1–D8 | P1 | F1 |
| F3 | Núcleo compartilhado: validação de ambiente, erros de domínio → HTTP, envelope de resposta, filtro sem vazamento, logs JSON com redação, contexto de requisição, health/readiness com banco | S9, S13–S15, I8 | P1 | F1 |
| F4 | Autenticação Entra ID (JWKS/RS256/claims) e RBAC no banco com guard global *deny-by-default*; remoção dos endpoints de protótipo; provisionamento JIT por (`tid`,`oid`); gestão de usuários e papéis | S1–S8 | **P0** | F2, F3 |
| F5 | Regras: definição tipada e validada, motor determinístico (Constante, Causante, Aritmética, Padronal, Matrix, Projeção), versionamento imutável, concorrência otimista, auditoria | D2, seção 8 | P1 | F2, F4 |
| F6 | Fontes e cargas: cadastro com origem/metadados/colunas esperadas, upload CSV/XLSX com limites, checksum, validação assíncrona; conectores remotos desabilitados | S10, S11 | P1 | F2, F4 |
| F7 | Execuções: fila em PostgreSQL (`FOR UPDATE SKIP LOCKED`), worker separado, idempotência, entradas fixadas (versões de regra + cargas), progresso, cancelamento, reprocessamento | D3, seção 8 | P1 | F5, F6 |
| F8 | Relatório Consolidado: consulta paginada e exportação CSV/XLSX com proteção contra injeção de fórmula | seção 8 | P1 | F7 |
| F9 | Notificações in-app de sucesso/falha | seção 8 | P2 | F7 |
| F10 | Auditoria persistente em todas as mutações e eventos de acesso; consulta para administradores | seção 8, S2 | P1 | F3, F4 |
| F11 | Contrato OpenAPI 3.1 reescrito a partir da implementação + teste automatizado de rotas | seção 6 | P1 | F4–F10 |
| F12 | Frontend Next.js: MSAL, cliente tipado do envelope, telas do fluxo | S16 | P2 | F11 |
| F13 | Infraestrutura e CI: Dockerfile, Compose, plataforma de nuvem (Container Apps × Kubernetes — ADR-0004), Terraform, pipeline com typecheck/testes/migrations/contrato | I1–I7, S12 | P1/P2 | F1–F11 |
| F14 | Documentação e relatórios finais | — | P2 | todas |

## Critérios de aceitação por etapa

* **F1** — `npm run build:api` emite `dist/main.js` e `dist/worker.js`; `npm run build:web` constrói o Next; `npm run lint` e `npm run typecheck` executam sem erro de configuração.
* **F2** — migration aplica em banco vazio; `prisma migrate diff --from-migrations … --to-schema-datamodel …` sem diferenças (CI); seed reexecutável.
* **F4** — token com assinatura inválida, `alg` diferente de RS256, `iss`/`aud`/`tid` errados, expirado ou sem `oid` é rejeitado; rota sem `@Public()` exige autenticação; permissão vem do banco; usuário desativado é bloqueado.
* **F5** — atualização cria nova versão imutável; `expectedVersion` divergente retorna 409; motor reproduz as semânticas documentadas com testes por categoria.
* **F7** — mesma `Idempotency-Key` não cria duas execuções; execução registra as versões exatas usadas; falha parcial não deixa relatório parcial visível; cancelamento é cooperativo.
* **F8** — exportação CSV neutraliza células iniciadas por `= + - @`.
* **F11** — teste de rotas: conjunto de rotas implementadas = conjunto de operações do contrato.

## Restrições desta sessão

* Sem acesso ao npm registry: dependências novas ficam declaradas no `package.json` e o `package-lock.json`
  precisa ser regenerado com `npm install` na máquina do desenvolvedor (passo obrigatório documentado).
* A lógica pura (motor de regras, verificação de JWT, parsers CSV, máquina de estados) é escrita sem
  dependências externas para poder ser compilada e testada aqui com o TypeScript global.

## Situação ao final da execução

| Etapa | Situação | Observação |
| --- | --- | --- |
| F1 | Concluída, com pendência | Lockfiles precisam ser regenerados com acesso ao npm (B1) |
| F2 | Concluída | Migration e drift verificados em PostgreSQL 16; papel DML criado |
| F3 | Concluída | Métricas/tracing não implementados (pendência P1) |
| F4 | Concluída | Login real com o tenant não testado (B6/B10) |
| F5 | Concluída, com pendência | Lógica Variável não portada (B5); semântica a validar (B4) |
| F6–F10 | Concluídas | Integração com PostgreSQL real escrita, não executada aqui |
| F11 | Concluída | 40 operações; teste de contrato na suíte padrão |
| F12 | Concluída, com pendência | `next build` não executado aqui |
| F13 | Concluída como código | Kubernetes substituído por Container Apps (proposta); nada provisionado |
| F14 | Concluída | Este conjunto de documentos |

Detalhes: [03-relatorio-de-alteracoes.md](03-relatorio-de-alteracoes.md) e
[05-evidencias-de-validacao.md](05-evidencias-de-validacao.md).
