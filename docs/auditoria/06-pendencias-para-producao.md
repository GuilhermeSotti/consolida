# Entregável 5 — Pendências para produção

Classificação: **Bloqueante** (impede uso em ambiente compartilhado) · **Antes de produção** ·
**Limitação aceita no MVP** (registrada, sem ação imediata). Nenhum item abaixo foi simulado
como concluído.

## 1. Bloqueantes

| # | Pendência | Por quê | Como fechar | Responsável |
| --- | --- | --- | --- | --- |
| B1 | Regenerar e versionar `package-lock.json` e `web/package-lock.json` | Dependências mudaram; o registro npm estava inacessível nesta sessão; `npm ci` da CI falhará sem isso | `npm install` (raiz) e `npm --prefix web install`, revisar o diff do lockfile e commitar | Dev |
| B2 | Executar as verificações reais | Typecheck, lint, testes e build foram validados por meios equivalentes ([05](05-evidencias-de-validacao.md)) | `npm run verify`, `npm run verify:web`, `npm run test:integration`, `npm run db:migrate:check`, CI completa | Dev |
| B3 | Confirmar a matriz papel × permissão e quais papéis cada perfil administrativo pode conceder | Proposta derivada do Passo 7 ([segurança §3](../arquitetura/seguranca.md#3-matriz-papel--permissão-proposta--requer-confirmação-do-negócio)); hoje `FUNCTIONAL_ADMIN` concede qualquer papel não-ADMIN a outros usuários | Validação com o negócio; ajuste em `access-control.ts`/`users.service.ts` + seed | Negócio + Dev |
| B4 | Validar a semântica do motor e as divergências do script M | Resultados financeiros dependem disso ([semântica §5](../regras/semantica-do-motor.md#5-divergências-intencionais-em-relação-ao-script-m)) | Rodar casos reais (cargas anonimizadas) comparando com o relatório do Power Query | Negócio + Dev |
| B5 | Decidir sobre a Lógica **Variável** | Não portada (sem especificação); se o relatório atual depende dela, o MVP não substitui o processo | Especificação com exemplos de entrada/saída; ou aceite formal de sua ausência | Negócio |
| B6 | Registros do Entra ID por ambiente | Sem eles não há login | API (tokens v2, escopo `access_as_user`) + SPA (redirect URIs) — [autenticacao.md](../arquitetura/autenticacao.md) | Identidade/TI |
| B7 | Confirmar plataforma, região e rede | Azure/Container Apps é proposta inferida; `location` herdado | ADR-0004 aprovada; tfvars revisados; política de rede (WAF, *private endpoints*) | Plataforma |
| B8 | Provisionar e validar a infraestrutura | Nada foi provisionado; `terraform validate/plan` não executados | Bootstrap em dev conforme [deploy.md](../guias/deploy.md) | Plataforma |
| B9 | Papel de banco DML em hml/prod | Até a troca, a aplicação usaria a credencial de migração | `infra/database/app-role.sql` + segredo `database-url-app` | Plataforma/DBA |
| B10 | Teste ponta a ponta real | Integrações externas só foram testadas com dublês | Login real, carga, regra, execução, exportação em dev | Dev + Negócio |

## 2. Antes de produção

| # | Pendência | Observação |
| --- | --- | --- |
| P1 | Métricas, tracing e alertas | OpenTelemetry/Application Insights; alertas para falhas de execução, fila acumulada, 5xx, falhas de JWKS |
| P2 | Limite de taxa na borda | O limite atual é por instância (memória); usar ingress/WAF ou armazenamento compartilhado |
| P3 | CSP do web sem `'unsafe-inline'` | *Nonce* via middleware do Next (exige renderização dinâmica) |
| P4 | Imagens base fixadas por *digest* + atualização automática | `node:22.22.0-alpine@sha256:…`, `postgres:16.15-alpine@sha256:…`; Dependabot/Renovate (inclui `xlsx` por URL, fora do alcance do `npm audit`) |
| P5 | Retenção e expurgo | Cargas (arquivo e linhas), relatórios e auditoria crescem sem limite; definir prazos (LGPD/negócio) e job de expurgo |
| P6 | Classificação de dados (LGPD) | Conteúdo das cargas pode ter dados pessoais; avaliar mascaramento na exportação e acesso |
| P7 | Backup e restauração testados | PITR do Flexible Server; exercício de restauração documentado |
| P8 | Dimensionamento | Worker mantém a execução inteira em memória (2 GiB configurados); medir com volumes reais antes de ajustar limites |
| P9 | Validação de esquema das respostas | Testes e2e verificam campos-chave, não o esquema completo do contrato |
| P10 | Testes de interface (e2e do web) | Não existem; sugerido Playwright para o fluxo principal |
| P11 | Rotação de credenciais | Senha do papel DML (manual); avaliar autenticação Entra no PostgreSQL |
| P12 | Revisão de segurança independente / pentest | Recomendado antes da produção |
| P13 | Varredura de arquivos enviados | Avaliar antimalware conforme política corporativa |
| P14 | Acessibilidade | Revisão WCAG das telas |
| P15 | Exportação XLSX de relatórios grandes | Hoje limitada a `REPORT_XLSX_MAX_CELLS` porque é montada na requisição; gerar no worker e disponibilizar para download se o negócio precisar de XLSX acima do limite |

## 3. Limitações aceitas no MVP

* Conectores remotos (SQL, SharePoint, APIs) desabilitados — exigem allowlist de destinos e
  credenciais por referência a cofre antes de existir.
* Contexto de regras apenas por **Fase** (Parâmetro/Fornecedor/Empresa/Aba/Documento do script
  não modelados).
* Fila por *polling* no PostgreSQL; arquivos e linhas no banco; processamento em memória.
* Notificações apenas internas (sem e-mail/Teams).
* Sem aprovação multinível, BI, sugestões por IA ou app móvel (fora do escopo).
