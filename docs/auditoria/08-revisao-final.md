# Fase G — Revisão final independente

> **Quem revisou:** um subagente do Claude executado com contexto próprio (não participou da
> implementação), com acesso somente leitura ao repositório e às ferramentas de teste do ambiente.
> **Não** foi o AI-Harness: o Maestro do harness só tem agentes simulados (ver
> [07](07-proximas-acoes.md#ai-harness--proposta-de-integração-mínima)). O revisor executou a
> suíte (188 unitários e 27 e2e/contrato aprovados naquele momento) e reproduziu os achados
> marcados como *confirmados* em cópias do código.

Cada achado foi verificado por mim no código antes da correção. Status: **Corrigido** (com teste
ou evidência), **Pendência** (registrada em [06](06-pendencias-para-producao.md)).

| # | Sev. | Achado | Verificação | Disposição |
| --- | --- | --- | --- | --- |
| F1 | P1 | `package-lock.json` desatualizado: `npm ci`, CI e builds Docker falham; correção do `xlsx` não travada | Procede (o lockfile não pôde ser regenerado sem acesso ao npm) | **Pendência B1** (bloqueante, primeira ação) |
| F2 | P1 | `web/package-lock.json` inexistente: CI web, `web/Dockerfile` e deploy falham | Procede (mesma causa) | **Pendência B1** |
| F3 | P1 | XLSX com mais de ~125 mil linhas falhava (`Math.max(...rows)` estoura a pilha) e a carga terminava `FAILED` após 3 tentativas | Reproduzido | **Corrigido**: largura calculada sem espalhar argumentos; teste com 130 mil linhas |
| F4 | P1 | Exportação XLSX síncrona na requisição: 200 mil linhas × 20 colunas ≈ 25 s de event loop bloqueado e ≈ 2,2 GB (API com 1 GiB) | Medido de novo aqui: 200 mil células ≈ 1,3 s/110 MB; 2 milhões ≈ 15 s/620 MB | **Corrigido** com limite `REPORT_XLSX_MAX_CELLS` (padrão 200 mil, `422 EXPORT_TOO_LARGE`, CSV continua sem limite). Geração assíncrona no worker → pendência P15 |
| F5 | P2 | Intervalo declarado da aba expandido antes da checagem de colunas: arquivo de 152 KB (células em A1 e XFD1) esgotava 1,5 GB de heap | Reproduzido: leitor anterior abortou por falta de memória; o novo rejeita com `TOO_MANY_COLUMNS` em 175 ms/102 MB | **Corrigido**: largura medida pelas células com valor antes da expansão; apenas conteúdo ZIP chega ao SheetJS |
| F6 | P2 | `users:manage` podia conceder a si mesmo qualquer papel não-ADMIN (FUNCTIONAL_ADMIN chegava às 16 permissões) | Procede | **Corrigido**: ninguém altera os próprios papéis (`CANNOT_CHANGE_OWN_ROLES`). Política de quais papéis cada perfil concede → pendência B3 |
| F7 | P2 | CSV truncado no meio era entregue com 200 e fim "normal" (handler padrão do Nest chama `res.end()`) | Procede | **Corrigido**: conexão destruída após os cabeçalhos; 500 genérico antes deles; web avisa `DOWNLOAD_INTERRUPTED`; teste e2e com falha simulada |
| F8 | P2 | Identidade única no Azure lia o segredo de migração (DDL); segredo da aplicação nascia com credencial admin | Procede | **Corrigido**: identidades separadas (apps/migrator/web), leitura por segredo, segredo da aplicação nasce inválido; API/worker recusam iniciar em produção com o papel dono das tabelas (consulta validada em PostgreSQL 16) |
| F9 | P3 | Limite de linhas do `LOOKUP` só verificado depois da junção completa | Procede | **Corrigido**: verificação durante a junção; teste mostra parada em `maxRows + 1` |
| F10 | P3 | Worker que perdeu o lease podia marcar como `COMPLETED` um job reassumido por outro | Procede | **Corrigido**: gravação final cercada por `locked_by`; logs `job_lease_lost`; teste de integração escrito |
| F11 | P3 | CSV: `x,=1+1` não era colocado entre aspas (Excel com separador `,` exporia a fórmula) | Procede | **Corrigido**: aspas em textos com `; , TAB`, aspas ou quebras; testes |
| F12 | P3 | Checagens administrativas usavam os papéis do início da requisição | Procede | **Corrigido**: papéis e status de quem executa relidos sob o *lock* (`USER_INACTIVE` se desativado) |
| F13 | P3 | `/health/ready` público, sem limite, consultava o banco a cada chamada | Procede | **Corrigido**: resultado reaproveitado por `HEALTH_READY_CACHE_MS` (padrão 2 s), chamadas simultâneas compartilham a consulta |
| F14 | P3 | Auditoria de provisionamento fora da transação; status da fonte checado antes do *lock* do upload | Procede | **Corrigido**: `USER_PROVISIONED` na mesma transação da criação; status relido sob o *lock* |

Áreas revisadas sem achados (resumo do revisor): verificação de tokens e JWKS, ordem e
abrangência dos guards, escopo de notificações, salvaguardas de último administrador,
idempotência e atomicidade das execuções, fila (`SKIP LOCKED`, tentativas, desligamento),
parsers de entrada, migration e triggers, filtro de exceções e redação de logs, MSAL/CSP do web,
workflows (OIDC, SHA, sem injeção) e desenho do Dockerfile.

Não verificáveis no ambiente (confirmadas como pendências): `terraform plan/apply`, `npm ci` e
builds de imagem, SheetJS 0.20.3, testes de integração com Prisma e login real no Entra ID.

## Validação após as correções

| Verificação | Resultado |
| --- | --- |
| Typecheck API + testes | 0 erros |
| Unitários | 201/201 (22 arquivos) |
| e2e HTTP + contrato | 22/22 + 6/6 |
| Typecheck web | 0 erros |
| Lint API / web (aproximação) | 0 erros, 0 avisos |
| Auditoria do OpenAPI | 0 erros, 0 avisos (40 operações) |
| Terraform (sintaxe + referências) | sem erros |
| Script do papel DML | idempotente em bancos novos com e sem `_prisma_migrations`; privilégios reverificados |
