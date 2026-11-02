# Segurança

Resumo dos controles implementados, da matriz de acesso e das lacunas conhecidas. Autenticação em
detalhe: [autenticacao.md](autenticacao.md).

## 1. Princípios

* **Negação por padrão**: guards globais (limite de taxa → autenticação → autorização). Toda rota
  declara a política; a ausência dela resulta em 403 e quebra o teste de contrato.
* **Identidade ≠ autorização**: o token prova *quem* é a pessoa; *o que* ela pode fazer vem do
  banco (papéis e permissões locais). Claims de papéis do token são ignoradas.
* **Validação nas fronteiras**: corpo, query e parâmetros são validados por parsers explícitos
  (propriedades desconhecidas rejeitadas, limites de tamanho, UUIDs, enums, caracteres de
  controle proibidos). Arquivos enviados são validados por extensão, assinatura e conteúdo.
* **Sem segredos no código** e sem segredos devolvidos pela API (metadados de bases recusam
  chaves com aparência de credencial).
* **Rastreabilidade**: mutações e negações de acesso são auditadas na mesma transação.

## 2. Controles por camada

| Área | Controle | Onde |
| --- | --- | --- |
| Token | RS256 + JWKS, `iss`/`aud`/`tid`/`ver`/`exp`/`nbf`/`iat`/`scp`/`azp`/`oid`; chaves ≥ 2048 bits; `alg` fixo | `src/modules/auth/infrastructure/jwt/` |
| Sessão no navegador | Authorization Code + PKCE (MSAL), cache em `sessionStorage`, sem segredo de cliente | `web/lib/msal.ts` |
| Autorização | `@RequirePermissions` / `@AuthenticatedOnly` / `@Public`; permissões do banco a cada requisição; usuário inativo bloqueado | `src/modules/auth/presentation/` |
| Acesso a objetos por ID | Recursos compartilhados exigem a permissão do recurso; notificações filtradas pelo dono (404 para terceiros); IDs validados como UUID (400) | controllers / `notifications.service.ts` |
| Administração | Ninguém altera os próprios papéis (`CANNOT_CHANGE_OWN_ROLES`) nem desativa a si mesmo; só `ADMIN` concede/retira `ADMIN` ou altera contas de administradores; papéis e status de quem executa são relidos sob *lock*; último `ADMIN` ativo protegido (defesa em profundidade) | `users.service.ts`, `prisma-users.repository.ts` |
| Entrada | JSON ≤ 1 MB; query sem objetos aninhados; upload multipart com limite (`IMPORT_MAX_FILE_BYTES`), um arquivo; nomes de arquivo saneados | `http-app.ts`, `sources.module.ts`, `source.ts` |
| Planilhas | Só XLSX (assinatura ZIP) chega ao SheetJS; largura medida pelas células com valor **antes** de expandir a aba (intervalo declarado até XFD não esgota memória); limites de linhas/colunas; datas convertidas sem fórmulas; SheetJS 0.20.3 (corrige CVE-2023-30533 e CVE-2024-22363) | `xlsx.reader.ts`, [ADR-0007](adr/0007-sheetjs-pela-cdn-oficial.md) |
| Exportação | CSV com BOM, neutralização de células iniciadas por `= + - @ TAB CR` e aspas em textos com `; , TAB`/aspas/quebras (injeção de fórmulas em qualquer separador regional); falha no meio do *stream* interrompe a conexão (nunca um arquivo truncado aparentando completo); XLSX com valores literais e limite de células (`REPORT_XLSX_MAX_CELLS`); `Cache-Control: no-store` | `reports/`, `shared/presentation/http/streaming.ts` |
| Erros | Mensagem genérica para erros inesperados; detalhe somente no log, correlacionado por `requestId` | `api-exception.filter.ts` |
| Cabeçalhos HTTP (API) | helmet: CSP `default-src 'none'` e `frame-ancestors 'none'`, `nosniff`, CORP `same-site`, HSTS (somente em produção); sem `x-powered-by` | `http-app.ts` |
| Cabeçalhos HTTP (web) | CSP restrita à origem da API e ao Entra ID, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` | `web/next.config.mjs` |
| CORS | Lista exata de origens (`https` obrigatório em produção); sem curinga | `app-config.ts` |
| Limite de taxa | Por IP, em memória por instância (`RATE_LIMIT_*`); *probes* de saúde não são limitados, mas o teste de banco do `/health/ready` é reaproveitado por `HEALTH_READY_CACHE_MS` | `app.module.ts`, `health/` |
| Logs | JSON com redação de tokens, senhas, segredos, cookies e e-mails; payloads volumosos omitidos | `logging/redact.ts` |
| Banco | Migrations por papel dedicado; aplicação com papel só DML (sem `TRUNCATE`/DDL; auditoria e versões de regra sem `UPDATE`); em produção a API e o worker **recusam iniciar** com a credencial dona das tabelas; triggers de imutabilidade | `infra/database/app-role.sql`, `prisma.service.ts`, migration de base |
| Contêineres | Usuário não-root, `tini`, sistema de arquivos somente-leitura no Compose, `no-new-privileges`, PostgreSQL publicado só em `127.0.0.1` | `Dockerfile`, `docker-compose.yml` |
| Nuvem | PostgreSQL sem acesso público (VNet); identidades gerenciadas separadas (API/worker, migração, web) com leitura **por segredo** no Key Vault (a aplicação não lê a credencial de migração); segredo da aplicação nasce inválido (falha fechada até o papel DML ser configurado); ACR sem usuário admin; deploy por OIDC (sem segredo no GitHub) | `infra/terraform`, `.github/workflows/deploy.yml` |
| Cadeia de suprimentos | Actions fixadas por SHA; CodeQL; `npm audit`; revisão de dependências em PR; Trivy nas imagens | `.github/workflows/` |

## 3. Matriz papel × permissão (proposta — requer confirmação do negócio)

Fonte única: `src/modules/auth/domain/access-control.ts` (o seed e os guards derivam dela).

| Permissão | ADMIN | FUNCTIONAL_ADMIN | BUSINESS_ANALYST | OPERATIONS | MANAGER | VIEWER |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `rules:view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `rules:create` | ✔ |  | ✔ |  |  |  |
| `rules:update` | ✔ |  | ✔ |  |  |  |
| `rules:activate` | ✔ |  | ✔ |  |  |  |
| `sources:view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `sources:create` | ✔ |  |  | ✔ |  |  |
| `sources:update` | ✔ |  |  | ✔ |  |  |
| `sources:import` | ✔ |  |  | ✔ |  |  |
| `executions:view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `executions:run` | ✔ |  | ✔ | ✔ |  |  |
| `executions:cancel` | ✔ |  |  | ✔ |  |  |
| `reports:view` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `reports:export` | ✔ |  | ✔ |  | ✔ |  |
| `users:view` | ✔ | ✔ |  |  |  |  |
| `users:manage` | ✔ | ✔ |  |  |  |  |
| `audit:view` | ✔ | ✔ |  |  |  |  |

Observações: `FUNCTIONAL_ADMIN` administra usuários mas não concede `ADMIN` e não altera os
próprios papéis; ainda pode conceder papéis de negócio a **outros** usuários — definir com o
negócio quais papéis cada perfil administrativo pode conceder (pendência B3). `GET /auth/me` e as
notificações exigem apenas autenticação; papéis novos ou mudanças de matriz entram pelo código +
seed (reexecutável), nunca por SQL manual.

## 4. Dados sensíveis

* Senhas corporativas: nunca trafegam pela aplicação.
* Tokens: não são persistidos nem registrados.
* Dados pessoais armazenados: nome de exibição, e-mail/UPN (exibição) e identificadores do Entra;
  IP e user-agent na auditoria.
* Conteúdo das cargas: pode conter dados de negócio sensíveis — fica no PostgreSQL (criptografia
  em repouso do serviço gerenciado). **Pendente**: política de retenção/expurgo e classificação
  dos dados com o negócio.
* Metadados de bases: chaves que sugerem credenciais (`password`, `pwd`, `senha`, `secret`, `token`,
  `credential`, `apiKey`, `connectionString`…) são recusadas com `FORBIDDEN_KEY`.

## 5. Lacunas conhecidas (tratadas em [pendências](../auditoria/06-pendencias-para-producao.md))

1. Limite de taxa por instância (multiplica com réplicas) — usar limite no ingress/WAF.
2. CSP do web com `'unsafe-inline'` em scripts (exigência do App Router sem *nonce*).
3. Key Vault e ACR com endpoint público (protegidos por RBAC); avaliar *private endpoints*.
4. Sem métricas/alertas de segurança (tentativas negadas são auditadas, mas não alertadas).
5. Sem varredura antimalware de arquivos enviados (somente CSV/XLSX, validados por conteúdo).
6. Rotação da senha do papel DML do banco é manual.
