# Processamento assíncrono: cargas e execuções

## 1. Fila de jobs no PostgreSQL

Tabela `background_jobs` (tipos `PROCESS_IMPORT` e `RUN_EXECUTION`), consumida pelo worker
(`src/worker/job-runner.service.ts`). Decisão e alternativas: [ADR-0002](adr/0002-fila-de-jobs-no-postgresql.md).

* **Enfileiramento transacional**: o job é inserido na mesma transação que cria a carga ou a
  execução — não existe job sem registro nem registro sem job.
* **Reivindicação**: `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`; várias
  réplicas do worker nunca pegam o mesmo job ao mesmo tempo.
* **Lease e heartbeat**: o job em execução renova `heartbeat_at` a cada
  `min(30 s, WORKER_JOB_LEASE_SECONDS/3)`. Se o worker morrer, o job volta a ser reivindicável
  quando o heartbeat passa de `WORKER_JOB_LEASE_SECONDS` (padrão 300 s).
* **Retentativas**: falhas inesperadas são reagendadas com *backoff* exponencial
  (5 s, 10 s, 20 s… até 5 min) até `max_attempts` (3). Esgotadas as tentativas, o handler marca a
  entidade como falha (`IMPORT_FAILED`/`EXECUTION_FAILED`, com notificação e auditoria).
* **Falhas de negócio** (arquivo inválido, regra sem entrada, limite de linhas) **não** são
  retentadas: a entidade termina em estado final com o código do erro.
* **Desligamento gracioso** (SIGTERM): o worker para de reivindicar, a execução em curso para na
  próxima fronteira de regra e o job volta para a fila sem consumir tentativa
  (`WORKER_SHUTDOWN_GRACE_MS`).
* **Cerca do lease**: a gravação final (`COMPLETED`/`FAILED`) só vale se o worker ainda for o dono
  do job (`locked_by`); um worker que perdeu o lease registra `job_lease_lost` e não sobrescreve o
  novo dono nem dispara o tratamento de tentativas esgotadas.
* **Liveness**: cada ciclo do laço e cada heartbeat bem-sucedido registram progresso. Sem
  progresso por `3 × heartbeat + intervalo de polling` (≈ 92 s no padrão), o worker é dado como
  travado: o arquivo `WORKER_HEARTBEAT_FILE` deixa de ser tocado e `GET /health/live` em
  `WORKER_HEALTH_PORT` passa a responder 503 — a plataforma reinicia o contêiner e o lease
  devolve o job à fila.

## 2. Cargas (imports)

```
POST /sources/{id}/imports ──► RECEIVED ──(worker)──► PROCESSING ──► VALIDATED
                                                         │──► REJECTED (conteúdo inválido; não retenta)
                                                         └──► FAILED   (erro inesperado após 3 tentativas)
```

1. **Recepção (API)**: fonte ativa; arquivo presente, ≤ `IMPORT_MAX_FILE_BYTES`, extensão e
   assinatura compatíveis com o formato da fonte (CSV/TXT ou XLSX); nome saneado; SHA-256 do
   conteúdo. Uploads da mesma fonte são serializados (lock da linha da fonte) e um arquivo
   idêntico pendente ou validado é recusado (`409 DUPLICATE_IMPORT`). Arquivo, carga, job e
   auditoria são gravados numa transação; resposta `202`.
2. **Validação (worker)**: leitura com limites de linhas/colunas (`IMPORT_MAX_ROWS`,
   `IMPORT_MAX_COLUMNS`); CSV com delimitador configurado ou detectado (`; , TAB |`), UTF-8 (com ou
   sem BOM) ou Windows-1252 como alternativa;
   XLSX pela aba configurada (somente valores, sem fórmulas; só conteúdo ZIP chega ao SheetJS; a
   largura é medida pelas células com valor antes de montar a matriz, então formatação até a coluna
   XFD não esgota memória). Normalização: nomes de coluna
   canônicos e únicos (maiúsculas, `_`), células vazias → `null`, colunas `FILE_ID` (nome do
   arquivo) e `VOLUME = 1` acrescentadas como no script original; colunas obrigatórias ausentes
   e linhas mais largas que o cabeçalho rejeitam a carga (até 50 problemas listados).
3. **Gravação**: linhas em blocos de 1.000 (`import_chunks`) + status `VALIDATED` + notificação na
   **mesma transação**: nunca há carga parcialmente visível. Reprocessar o mesmo job é
   idempotente (cargas finais são ignoradas).

## 3. Execuções

```
POST /executions ──► QUEUED ──(worker)──► RUNNING ──► SUCCEEDED (relatório disponível)
                       │                    ├──► FAILED     (erro de negócio ou tentativas esgotadas)
                       └──► CANCELLED ◄─────┘ (cancelamento cooperativo)
```

### 3.1 Solicitação (API)

* Entrada: `sourceId`, `phase` opcional, `importId` opcional (padrão: última carga validada da
  fonte) e `referenceImportIds` opcional (por fonte de referência usada por regras `LOOKUP`).
* **Snapshot de entradas** (`input_snapshot`): carga principal, cargas de referência e a lista
  exata de (`ruleId`, `ruleVersionId`, `version`) das regras **ativas** da fonte/fase, na ordem
  de execução. Alterações posteriores de regras não afetam a execução.
* **Idempotência**: cabeçalho `Idempotency-Key` (por usuário). Mesma chave + mesma requisição →
  `200` com a execução original e `Idempotent-Replayed: true`; mesma chave + requisição diferente
  → `409 IDEMPOTENCY_KEY_REUSED`. A unicidade é garantida por índice no banco (corridas entre
  réplicas da API resultam em repetição, não em duplicata).
* Erros de pré-condição: fonte inativa (`409`), sem carga validada ou sem regras ativas (`422`).
* Resposta `202` com `Location: /api/v1/executions/{id}`.

### 3.2 Processamento (worker)

1. `QUEUED → RUNNING` (condicional; uma execução cancelada antes de começar termina
   `CANCELLED`). Uma execução encontrada em `RUNNING` (worker anterior caiu) recomeça do zero
   com as mesmas entradas fixadas, com log de aviso.
2. Carrega a carga principal e as de referência (precisam continuar `VALIDATED`) e as versões de
   regra do snapshot.
3. Aplica o motor ([semântica](../regras/semantica-do-motor.md)) regra a regra: log por etapa
   (linhas antes/depois, afetadas, avisos), progresso e verificação de cancelamento entre regras;
   limite de linhas por etapa (`EXECUTION_MAX_ROWS`), verificado **durante** a junção de `LOOKUP`
   (chaves duplicadas não chegam a multiplicar as linhas em memória).
4. **Uma transação**: grava o Relatório Consolidado (blocos de 1.000 linhas), marca `SUCCEEDED`
   (condicional), log final, notificação ao solicitante e auditoria. Se qualquer passo falhar,
   nada disso fica visível.
5. Falhas de negócio → `FAILED` com `error_code` (`ROW_LIMIT_EXCEEDED`, `INPUT_UNAVAILABLE`, …),
   notificação e auditoria. Falhas inesperadas → retentativa do job; após a última,
   `FAILED/INTERNAL_ERROR`.

### 3.3 Cancelamento e reprocessamento

* `POST /executions/{id}/cancel`: em `QUEUED` cancela imediatamente; em `RUNNING` registra o
  pedido e o worker encerra na próxima fronteira de regra (`CANCELLED`, sem relatório).
  Execuções finalizadas → `409`.
* `POST /executions/{id}/rerun`: cria **nova** execução com o mesmo snapshot
  (`reproduced_from_id`), também idempotente. O resultado é reproduzível porque cargas validadas
  e versões de regra são imutáveis e o motor é determinístico (`engine_version` registrado).

## 4. Relatório Consolidado

* Criado somente por execuções `SUCCEEDED`; imutável; colunas e quantidade de linhas registradas.
* Consulta: `GET /reports`, `GET /reports/{id}`, `GET /reports/{id}/rows` (paginado).
* Exportação: `GET /reports/{id}/export?format=csv|xlsx` (`reports:export`), auditada
  (`REPORT_EXPORTED`). CSV em UTF-8 com BOM, `;` e CRLF, transmitido em blocos com neutralização
  de fórmulas; se a leitura falhar no meio, a conexão é interrompida e o web avisa
  (`DOWNLOAD_INTERRUPTED`) em vez de salvar um arquivo parcial. XLSX é montado em memória na
  requisição, por isso é limitado a `REPORT_XLSX_MAX_CELLS` células (padrão 200 mil ≈ 1,3 s e
  ≈ 110 MB medidos); acima disso: `422 EXPORT_TOO_LARGE` — usar CSV.

## 5. Limites e dimensionamento

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `IMPORT_MAX_FILE_BYTES` | 20 MB | Tamanho máximo do upload (413 acima disso) |
| `IMPORT_MAX_ROWS` / `IMPORT_MAX_COLUMNS` | 200.000 / 500 | Carga rejeitada acima disso |
| `EXECUTION_MAX_ROWS` | 500.000 | Execução falha se uma etapa produzir mais linhas (ex.: `LOOKUP` que duplica) |
| `REPORT_XLSX_MAX_CELLS` | 200.000 | Exportação XLSX acima disso → 422 (CSV sem limite) |
| `WORKER_POLL_INTERVAL_MS` | 2.000 | Intervalo de consulta da fila ociosa |
| `WORKER_JOB_LEASE_SECONDS` | 300 | Tempo para reivindicar job de worker morto |

O worker mantém o conjunto de dados de uma execução **inteiro em memória** (carga principal +
referências + resultado). A configuração de nuvem usa 2 GiB por réplica; volumes maiores exigem
medir consumo real com dados representativos antes de aumentar os limites (pendência registrada).
