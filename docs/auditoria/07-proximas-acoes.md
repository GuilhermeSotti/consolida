# Entregável 6 — Próximas ações priorizadas

## P0 — imediato (desenvolvedor, antes de qualquer commit)

1. Aplicar o patch numa branch nova (`apply-consolidahub-refactor.ps1` — não faz commit nem push).
2. `npm install` e `npm --prefix web install`; revisar e versionar os lockfiles (pendência B1).
3. `npm run verify` e `npm run verify:web`; com PostgreSQL local: `npm run test:integration` e
   `npm run db:migrate:check`. Registrar qualquer divergência em relação ao
   [entregável 4](05-evidencias-de-validacao.md).
4. Revisar o diff (387 arquivos) e, com autorização, commitar e abrir PR para `dev` — a CI
   executa API, banco, web, imagens (Trivy), CodeQL e revisão de dependências.

## P1 — próximas 1–2 semanas

5. Sessões com o negócio: matriz de permissões (B3), semântica e divergências do motor com casos
   reais anonimizados (B4), Lógica Variável (B5), limites de carga e retenção (P5/P6).
6. Registros do Entra ID de desenvolvimento (B6); login real local; primeiro administrador.
7. Confirmar plataforma/região/rede (B7) e executar `terraform plan` em dev (B8); bootstrap,
   papel DML (B9) e fluxo de fumaça real (B10).

## P2 — antes de produção

8. Observabilidade: OpenTelemetry (traces + métricas), alertas e painéis (P1).
9. Endurecimento: limite de taxa na borda/WAF (P2), CSP com *nonce* (P3), imagens por *digest* e
   atualização automática de dependências (P4), backup/restauração testados (P7).
10. Qualidade: validação de esquema das respostas contra o contrato (P9), e2e de interface com
    Playwright (P10), testes de carga com volumes reais e ajuste de memória do worker (P8).
11. Revisão de segurança independente (P12).

## P3 — evolução

12. Lógica Variável (após especificação) e contextos adicionais de regra (fornecedor/empresa/aba).
13. Conectores remotos com allowlist e credenciais por cofre.
14. Notificações externas (e-mail/Teams) e armazenamento de arquivos em Blob, se o volume exigir.

## AI-Harness — proposta de integração mínima

**Estado verificado** (23/10/2026, `C:\Users\Particular\Projetos\ai-harness`, pacote Python
0.1.0): diretório `.git` sem nenhum commit; 58 testes próprios passam; o Maestro só aceita agentes
com `provider="simulated"` (`load_simulated_agent_registry`), o planejador ignora a solicitação
(`_ = user_request`) e não há servidor MCP nem integração com o Claude Code — apenas CLI/biblioteca.
**Nenhum resultado deste trabalho foi atribuído ao harness**; a revisão independente da Fase G foi
feita por um subagente do próprio Claude, identificado como tal.

Menor implementação para torná-lo útil, em etapas verificáveis:

1. **Versionar** o repositório (commit inicial) — hoje não há histórico nem como revisar mudanças.
2. **Provider real** atrás do contrato existente em `integrations.py`/`runtime.py` (ex.: API da
   Anthropic ou Azure OpenAI, conforme a política da organização), com credencial lida de
   variável de ambiente/cofre (nunca em arquivo), *timeout*, limite de custo e registro de
   `provider`/`model`/versão em cada execução. Substituir `load_simulated_agent_registry` por um
   carregador que aceite providers declarados e aprovados pela política (`policies.py`).
3. **Planejador que usa a solicitação**: primeiro um roteamento determinístico por competências
   (arquitetura, segurança, qualidade, dados, revisão); depois, opcionalmente, planejamento pelo
   provider com saída estruturada validada (pydantic).
4. **Interface para o Claude Code**: servidor MCP (stdio) com ferramentas `plan_task`,
   `run_task` (sujeita às aprovações do harness), `get_run` e `list_runs`, registrado no
   `.mcp.json` do ConsolidaHub. Alternativa mais simples: a CLI existente com saída `--json`.
5. **Rastreabilidade**: cada resultado com `run_id`, agente, provider/modelo, hash da entrada e
   evidências citadas; resultados de provider simulado sempre marcados como tal.
6. **Testes**: manter os 58 existentes; acrescentar testes das ferramentas MCP e do provider com
   dublê explicitamente identificado.

Critério de aceite: a partir de uma sessão do Claude Code, `run_task("revisar PR X")` via MCP
retorna um resultado cuja proveniência mostra um provider real, persistido no histórico do
harness, que pode então ser apresentado como revisão de um agente independente.
