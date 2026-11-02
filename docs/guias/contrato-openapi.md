# Contrato OpenAPI

`contracts/openapi.yaml` é a **fonte única** da API HTTP (OpenAPI 3.1, prefixo `/api/v1`).
Decisão: [ADR-0003](../arquitetura/adr/0003-contrato-openapi-unico.md).

## Convenções

* Envelope: `ApiSuccess` (`success`, `data`, `metadata` de paginação) e `ApiError`
  (`success: false`, `error.code`, `error.message`, `error.details[]`, `error.requestId`).
* Paginação: `page` (≥ 1) e `pageSize` (1–100, padrão 20) → `metadata.page`, `pageSize`,
  `totalItems`, `totalPages`.
* Segurança: `bearerAuth` global; rotas públicas declaram `security: []`; operações protegidas
  declaram `x-required-permissions` (vazio quando basta estar autenticado) e documentam `401` e
  `403`.
* Nulos em 3.1: `type: [string, 'null']` (nunca `nullable`).
* Execuções: `POST /executions` e `/rerun` documentam `202` (criada) e `200` (repetição
  idempotente) e o cabeçalho `Idempotency-Key`.

## Como alterar a API

1. Altere o contrato e o código **na mesma PR**.
2. `npm run test:contract` — falha se rotas, status de sucesso, permissões ou rotas públicas
   divergirem, se uma rota não tiver política de acesso, ou se houver `$ref` quebrada,
   `operationId` repetido ou palavra-chave do 3.0.
3. Mudanças incompatíveis (remover campo, mudar tipo, tornar obrigatório) exigem nova versão de
   caminho (`/api/v2`) ou período de convivência combinado com os consumidores.

## Pendências

* Os testes e2e ainda não validam os corpos de resposta contra os esquemas do contrato.
* Não há publicação automática de documentação navegável (Swagger UI foi removido da API de
  produção; usar um visualizador externo sobre o arquivo).
