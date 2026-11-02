# ADR-0006 — Frontend Next.js como pacote separado

**Status:** aceita · **Data:** 2026-10-23

## Contexto
O frontend herdado vivia em `src/app` dentro do pacote da API, compartilhando `tsconfig`
(`noEmit`, `jsx`, plugin `next`) e dependências — nenhum dos dois aplicativos compilava. O commit
inicial era Next 16/React 19 rebaixado para Next 14 sem ajustar arquivos.

## Decisão
* `web/` é um pacote npm próprio (Next.js 14.2.35, React 18.3.1, MSAL), com lockfile,
  `tsconfig`, ESLint (`next lint`) e Dockerfile próprios; saída `standalone`.
* A API não depende do frontend; o web só consome o contrato HTTP.
* Versões mantidas na linha já travada no lockfile herdado (Next 14.2.35/React 18.3.1).

## Alternativas
* Workspaces npm — viável, mas acopla instalações e não traz ganho no MVP.
* Atualizar para Next 15/16 — mudança de major sem necessidade funcional; fica para avaliação.

## Consequências
* Builds, imagens e varreduras independentes; CI com job próprio para o web.
* Variáveis `NEXT_PUBLIC_*` são embutidas no build: a imagem web é por ambiente.
