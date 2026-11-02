# Operação e suporte

## 1. Sinais de saúde

| Componente | Verificação | Falha significa |
| --- | --- | --- |
| API | `GET /api/v1/health/live` | Processo travado/morto |
| API | `GET /api/v1/health/ready` (consulta `SELECT 1`, resultado reaproveitado por `HEALTH_READY_CACHE_MS`) | Banco indisponível — a réplica sai do balanceamento |
| Worker | `GET /health/live` na porta `WORKER_HEALTH_PORT` (Container Apps) ou idade do arquivo `WORKER_HEARTBEAT_FILE` (Compose) | Laço da fila sem progresso há ≈ 92 s (padrão) |

## 2. Logs

JSON por linha em stdout (Log Analytics na nuvem). Campos úteis: `level`, `context`, `msg`/`event`,
`requestId`, `userId`, `jobId`. Eventos relevantes: `access_token_rejected` (`reason`),
`jwks_refresh_failed`, `job_failed_will_retry`, `job_exhausted`, `job_interrupted`,
`job_lease_lost` / `job_completed_after_lease_lost` / `job_exhausted_after_lease_lost` (worker
travou além do lease e outro assumiu o job), `worker_started`/`worker_stopped`. O `requestId`
devolvido ao usuário em erros (`error.requestId`) localiza a requisição nos logs e na auditoria.

## 3. Situações comuns

| Situação | Diagnóstico | Ação |
| --- | --- | --- |
| Carga parada em `RECEIVED`/`PROCESSING` | Worker parado ou job em retentativa (`background_jobs.last_error`) | Verificar worker; o job é retomado após o lease (300 s) |
| Carga `REJECTED` | `validationErrors` da carga (colunas ausentes, linhas inválidas, aba inexistente) | Corrigir o arquivo e reenviar (conteúdo idêntico já validado é recusado como duplicado) |
| Execução `FAILED` | `errorCode`/`errorMessage` + logs da execução (`GET /executions/{id}/logs`) | Corrigir regra/carga e solicitar nova execução; `INTERNAL_ERROR` → logs do worker pelo `jobId` |
| Execução lenta | Progresso (`progress.rulesApplied/totalRules`) e logs por regra | Avaliar volume e regras `LOOKUP` que duplicam linhas |
| 401 para todos | `access_token_rejected` com o mesmo `reason` | Ver [autenticacao.md](../arquitetura/autenticacao.md#6-problemas-comuns) |
| Exportação XLSX recusada (`EXPORT_TOO_LARGE`) | Relatório acima de `REPORT_XLSX_MAX_CELLS` | Exportar em CSV (ou ajustar o limite após medir memória) |
| "Download interrompido" no web | Falha de leitura durante o CSV (conexão abortada de propósito) | Repetir; ver logs da API pelo horário/`requestId` |
| API/worker não sobem em produção ("papel dono das tabelas") | `database-url-app` com a credencial de migração | Configurar o papel restrito ([deploy.md](deploy.md#4-banco-de-dados-papéis-de-menor-privilégio-obrigatório-antes-do-uso-real)) |
| Ninguém administra | Último administrador desligado da empresa | `admin:grant-role` (auditado) |

## 4. Consultas de apoio (somente leitura)

```sql
-- jobs pendentes/em execução e falhas recentes
SELECT type, status, attempts, max_attempts, run_after, heartbeat_at, left(last_error, 200)
  FROM background_jobs WHERE status IN ('PENDING','RUNNING') OR (status = 'FAILED' AND updated_at > now() - interval '1 day')
 ORDER BY created_at DESC LIMIT 50;

-- execuções das últimas 24 h por status
SELECT status, count(*) FROM executions WHERE created_at > now() - interval '1 day' GROUP BY status;
```

Não altere tabelas manualmente para "destravar" execuções: estados são controlados pela aplicação
e a auditoria é somente-inclusão. Para repetir um processamento, use `POST /executions/{id}/rerun`.

## 5. Pendências operacionais

Métricas e alertas (taxa de erro, fila acumulada, falhas de execução), política de retenção de
cargas/relatórios/auditoria e testes de restauração de backup ainda não estão definidos —
[pendências](../auditoria/06-pendencias-para-producao.md).
