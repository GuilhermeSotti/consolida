# ADR-0003 — Contrato OpenAPI 3.1 único e verificado

**Status:** aceita · **Data:** 2026-10-23

## Contexto
O contrato herdado (`contracts/openapi/` multiarquivo) não era YAML válido, tinha 19 `$ref`
quebradas, usava `nullable` (inválido em 3.1) e divergia do código em 32 operações, além de
prever login por senha (proibido pelos requisitos).

## Decisão
* Um único arquivo `contracts/openapi.yaml` (OpenAPI 3.1), reescrito a partir da implementação.
* Extensão `x-required-permissions` em cada operação protegida.
* Teste `test/contract/openapi.contract-spec.ts` (executado em `npm test`): mesmo conjunto de
  rotas, código de sucesso documentado, permissões e rotas públicas idênticas às do código,
  `$ref` resolvíveis, sem palavras-chave do 3.0, `operationId` únicos, 401 documentado em toda
  operação protegida.

## Alternativas
* Gerar o contrato a partir de decorators (`@nestjs/swagger`) — exigiria decorators em todos os
  DTOs e tornaria o código a fonte do contrato; o requisito é contrato estável para clientes
  futuros (desktop/móvel).
* Manter multiarquivo — mais difícil de validar sem ferramentas externas.

## Consequências
* Mudança de API = mudança no contrato na mesma PR (o teste falha caso contrário).
* Esquemas de corpo/resposta ainda não são validados contra respostas reais (pendência:
  validação de esquema nos testes e2e).
