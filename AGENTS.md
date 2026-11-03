# Instruções para agentes e colaboradores — ConsolidaHub

Leia antes de alterar o repositório. Visão geral: `README.md`; arquitetura:
`docs/arquitetura/visao-geral.md`; decisões: `docs/arquitetura/adr/`.

## Fontes de verdade (ordem de precedência)

1. Requisitos de negócio e decisões aprovadas (documentos do projeto; decisões do Passo 7).
2. Especificações do ConsolidaHub e `contracts/openapi.yaml`.
3. ADRs vigentes em `docs/arquitetura/adr/`.
4. Código e testes (evidência do comportamento implementado — não prevalecem sobre requisito
   aprovado; registre o conflito antes de "corrigir").

Não invente requisitos, configurações ou resultados. Não declare verificação aprovada sem tê-la
executado. Funcionalidade fora do MVP (ver visão geral) exige aprovação.

## Stack e versões (não alterar sem justificativa)

NestJS 10 · TypeScript 5 · Prisma 5.22.0 (CLI e client na mesma versão) · PostgreSQL 16 ·
Next.js **14.2** + React 18 em `web/` (pacote npm separado; **não** é Next 15/16) · Node 22 LTS.

## Regras de arquitetura

* `src/modules/*/domain` e `application` não importam NestJS nem Prisma; dependem de portas.
* Entrada HTTP validada por parsers explícitos (`*.requests.ts` + `InputValidator`); propriedades
  desconhecidas são rejeitadas.
* Toda rota declara política: `@Public()`, `@AuthenticatedOnly()` ou `@RequirePermissions(...)`.
* Mudança de API = mudança em `contracts/openapi.yaml` na mesma PR (`npm run test:contract`).
* Mutação relevante grava auditoria **na mesma transação** (`AuditRecorder`).
* Trabalho longo vai para a fila (`JobQueue`) e roda no worker; nunca na requisição HTTP.
* Esquema só muda por migration (`npm run db:migrate:dev` local). Proibido `prisma db push`/
  `migrate reset` em ambientes compartilhados. Migrations devem ser compatíveis com a versão
  anterior da aplicação (expandir/contrair).
* Semântica do motor de regras documentada em `docs/regras/semantica-do-motor.md`; mudança de
  resultado ⇒ incrementar `ENGINE_VERSION`.

## Segurança

* Sem login fictício, usuário padrão ou bypass de autenticação — em nenhum ambiente.
* Tokens só são aceitos após validação criptográfica e de claims; identidade = (`tid`, `oid`),
  nunca o e-mail; papéis vêm do banco.
* Nada de segredos, tokens, senhas ou dados reais em código, logs, testes, seeds, commits ou
  documentação. `.env.example` contém apenas valores fictícios.
* Logs passam por `redact`; erros inesperados não expõem detalhes ao cliente.

## Verificação obrigatória antes de concluir uma tarefa

```bash
npm run verify        # prisma validate, typecheck, lint, test (unit+contract+e2e), build
npm run verify:web    # quando alterar web/
npm run test:integration   # quando alterar persistência ou fila (banco *_test)
```

Não remova testes, não afrouxe asserções e não desative regras de lint/compilação para obter
sucesso. Relate comandos executados e resultados reais.

## Controle de mudanças

Peça aprovação antes de: instalar/atualizar dependências relevantes, alterar infraestrutura ou
autenticação/permissões, executar migrations com risco de perda de dados, conectar serviços
externos, publicar ou implantar. Não faça commit, push ou deploy sem pedido explícito. Preserve
alterações locais do usuário.

## AI-Harness

O repositório `ai-harness` (na máquina de desenvolvimento: `C:\Users\Particular\Projetos\ai-harness`;
pacote Python 0.1.0) tem o Maestro com os agentes `analyst` e `reviewer`. O provider padrão é
**simulado** e não produz análise real; com um provider real configurado, os relatórios são reais.
Em 02/11/2026 foram usados com o provider Anthropic por um executor externo ao repositório (pasta de
operações), via API de biblioteca do Maestro, com plano explícito e limites maiores — a CLI e o
servidor MCP do harness limitam cada tarefa a 30 s, e o provider Anthropic do harness usa
`max_tokens` 4096. Execuções e achados: `docs/auditoria/09-execucao-azure-dev.md`. O servidor MCP
(`python -m ai_harness.mcp_server`) não estava registrado nas sessões usadas; a proposta de
integração está em `docs/auditoria/07-proximas-acoes.md`. Os agentes só leem evidências e devolvem
relatórios (não executam operações). Não atribua a eles resultados que não produziram nem simule
chamadas; reavalie a disponibilidade antes de cada tarefa relevante.
