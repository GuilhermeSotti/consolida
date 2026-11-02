# ADR-0002 — Fila de jobs no PostgreSQL

**Status:** aceita · **Data:** 2026-10-23

## Contexto
Importações e execuções precisam ser assíncronas, com retentativa, tolerância a queda do worker
e **atomicidade** entre o registro de negócio e o job (não pode existir execução sem job nem job
sem execução). O volume esperado do MVP é de dezenas a centenas de jobs por dia. O projeto
herdado previa Redis sem nenhum uso.

## Decisão
Tabela `background_jobs` no mesmo PostgreSQL: o job é criado na transação do caso de uso;
workers reivindicam com `FOR UPDATE SKIP LOCKED`, mantêm *lease* por heartbeat, retentam com
*backoff* exponencial até `max_attempts` e devolvem o job à fila no desligamento.

## Alternativas
* Redis/BullMQ — mais um serviço com estado, sem atomicidade com o banco (exigiria *outbox*).
* Azure Service Bus — idem, além de acoplar o domínio ao provedor desde o MVP.
* `pg-boss` — mesma ideia, porém nova dependência e esquema próprio; a implementação local é
  pequena (`src/worker/job-runner.service.ts`), teve o SQL de reivindicação validado em
  PostgreSQL 16 e tem teste de integração escrito (`test/integration/job-runner.int-spec.ts`,
  execução pendente na CI).

## Consequências
* Nenhuma infraestrutura adicional; garantias transacionais simples.
* Polling (padrão 2 s) gera consultas leves contínuas; adequado ao volume do MVP.
* Se o volume crescer em ordens de grandeza, migrar para um broker com padrão *outbox* — a porta
  `JobQueue` isola essa troca.
