# ADR-0008 — Arquivos enviados e dados tabulares no PostgreSQL

**Status:** aceita para o MVP · **Data:** 2026-10-23

## Contexto
Cargas (até 20 MB / 200 mil linhas por padrão) precisam ser rastreáveis (arquivo original e
checksum), validadas de forma assíncrona e reutilizáveis por execuções e reprocessamentos.
Relatórios precisam de consulta paginada e exportação.

## Decisão
* Arquivo original em `import_files` (bytea), uma linha por carga.
* Linhas normalizadas e resultados em blocos JSONB de 1.000 linhas (`import_chunks`,
  `report_chunks`), gravados na mesma transação que muda o status para final.

## Alternativas
* Azure Blob Storage para arquivos — melhor para volumes grandes, porém adiciona serviço,
  identidade e consistência entre banco e blob (gravação em duas fases).
* Uma linha do banco por linha de dados — milhões de linhas por carga, *bloat* e custo de escrita.

## Consequências
* Uma única fonte de verdade e backups consistentes; sem estado fora do banco.
* Crescimento do banco proporcional ao volume enviado — **política de retenção/expurgo pendente**
  (decisão de negócio) e monitoramento de armazenamento necessário.
* Execuções carregam os dados em memória no worker (ver limites em
  [processamento.md](../processamento.md)).
