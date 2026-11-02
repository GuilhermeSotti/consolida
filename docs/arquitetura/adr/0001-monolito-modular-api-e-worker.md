# ADR-0001 — Monólito modular com processos API e worker

**Status:** aceita · **Data:** 2026-10-23

## Contexto
O repositório herdado misturava Next.js e NestJS no mesmo `package.json`/`tsconfig`, com módulos
duplicados, regras de negócio acopladas a controllers e Prisma, e nenhum processamento
assíncrono. O MVP precisa de importações e execuções longas sem bloquear a API, e a equipe é
pequena.

## Decisão
* Um único código NestJS 10 organizado por módulos de domínio (`auth`, `users`, `sources`,
  `rules`, `executions`, `reports`, `notifications`, `audit`, `health`), cada um com camadas
  `domain`/`application` (sem framework, portas por interface) e `infrastructure`/`presentation`.
* Dois processos a partir da mesma imagem: **API** (`dist/main.js`) e **worker**
  (`dist/worker.js`, `NestFactory.createApplicationContext`, sem HTTP de negócio).
* Validação de entrada explícita (`InputValidator` + parsers por rota) em vez de
  `class-validator`/`class-transformer`.

## Alternativas
* Microsserviços — custo operacional desproporcional ao MVP.
* Processamento síncrono na API — timeouts e perda de trabalho em reinícios.
* Manter `class-validator` — decorators não validavam DTOs existentes (DTOs sem decorators) e
  escondiam regras; os parsers explícitos rejeitam propriedades desconhecidas e acumulam erros.

## Consequências
* Casos de uso e o motor são testáveis com *fakes* em memória; adaptadores são trocáveis.
* API e worker escalam de forma independente; o worker pode ter várias réplicas.
* Fronteiras de módulo são convenção (não há verificação automática de dependências entre
  módulos) — candidata a regra de lint futura.
