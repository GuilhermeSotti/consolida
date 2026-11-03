# Autenticação (Microsoft Entra ID) e identidade

Decisões de base (Passo 7, registradas no antigo `ENTRA_ID_SETUP.md`): login exclusivamente pelo
Entra ID da organização; papéis gerenciados **no ConsolidaHub** (não sincronizados do Entra);
permissões no formato `recurso:ação`. O ConsolidaHub nunca recebe, armazena ou transmite senhas.
Ver também [ADR-0005](adr/0005-identidade-entra-id-e-rbac-local.md).

## 1. Registros de aplicativo (por ambiente)

São necessários **dois** registros no tenant (dev, hml e prod podem usar registros distintos):

### 1.1 API — `ConsolidaHub API (<ambiente>)`

| Configuração | Valor |
| --- | --- |
| Tipos de conta | Somente este diretório organizacional (single tenant) |
| Expor uma API → Application ID URI | `api://<client-id-da-API>` (padrão aceito pela API; outro valor exige `ENTRA_API_AUDIENCE`) |
| Escopo | `access_as_user` — "Acessar o ConsolidaHub como o usuário conectado" |
| Manifesto | `"requestedAccessTokenVersion": 2` (em manifestos antigos: `accessTokenAcceptedVersion: 2`). **Obrigatório**: a API só aceita tokens v2.0 (`ver = 2.0`). |
| Aplicativos cliente autorizados (opcional) | client ID do SPA, para dispensar o consentimento do usuário |
| Segredos/certificados | **Nenhum** (a API só valida tokens) |
| App roles | Não usados (papéis são locais) |

Variáveis da API: `ENTRA_TENANT_ID` (GUID — não use `common`/`organizations`),
`ENTRA_API_CLIENT_ID`, opcionalmente `ENTRA_API_AUDIENCE` e `ENTRA_REQUIRED_SCOPE`
(padrão `access_as_user`).

### 1.2 SPA — `ConsolidaHub Web (<ambiente>)`

| Configuração | Valor |
| --- | --- |
| Plataforma | **Single-page application** (Authorization Code + PKCE, sem segredo) |
| Redirect URIs | `http://localhost:3001/` (dev) · `https://<origem-do-web>/` (hml/prod) — com a barra final |
| Front-channel logout | opcional |
| Permissões de API | Delegada `access_as_user` da API (conceder consentimento do administrador, se a política exigir) |
| Implicit grant / ID tokens | Desabilitado (não é necessário) |

Variáveis do web (públicas, embutidas no build): `NEXT_PUBLIC_ENTRA_TENANT_ID`,
`NEXT_PUBLIC_ENTRA_CLIENT_ID` (SPA), `NEXT_PUBLIC_API_SCOPE`
(`api://<client-id-da-API>/access_as_user`) e `NEXT_PUBLIC_API_BASE_URL`.
Na API: `ENTRA_ALLOWED_CLIENT_IDS=<client-id-do-SPA>` (obrigatório em produção; o `azp` do token
precisa estar nessa lista).

> **Dev (02/11/2026):** registros `ConsolidaHub API (dev)` (appId
> `e1396da9-b5d8-4365-a27c-23c37ab0fe35`) e `ConsolidaHub Web (dev)` (appId
> `29163ffc-63d3-40ee-a163-b7ee9c9c2117`) criados conforme esta seção — SPA com redirect
> `http://localhost:3001/`, pré-autorizado no escopo `access_as_user`; nenhum segredo ou
> certificado; nenhum consentimento administrativo. hml/prod pendentes. Evidências:
> [auditoria/09](../auditoria/09-execucao-azure-dev.md).

## 2. Fluxo

```mermaid
sequenceDiagram
  participant B as Navegador (SPA + MSAL)
  participant E as Entra ID
  participant A as API
  participant D as PostgreSQL
  B->>E: loginRedirect (Authorization Code + PKCE)
  E-->>B: code → tokens (cache em sessionStorage)
  B->>A: GET /api/v1/auth/me  Authorization: Bearer <access token>
  A->>E: JWKS (cache 12 h; renovação limitada a 1/min para kid desconhecido)
  A->>A: valida assinatura e claims
  A->>D: identidade (entra-id, tid, oid) → usuário local + papéis + permissões
  A-->>B: perfil, papéis e permissões
```

* O SPA usa `acquireTokenSilent` antes de cada chamada; se for necessária interação, redireciona
  (`acquireTokenRedirect`). Tokens ficam em `sessionStorage` (nunca `localStorage`).
* Logout: `logoutRedirect` no Entra (encerra a sessão local do SPA).
* A interface oculta ações sem permissão, mas **toda** decisão é refeita pela API.

## 3. Validação do access token (API)

Implementada sem bibliotecas de terceiros em `src/modules/auth/infrastructure/jwt/` (node:crypto):

1. Formato JWS compacto; cabeçalho com `alg = RS256` (qualquer outro — inclusive `none` — é
   rejeitado), `kid` obrigatório; chaves RSA ≥ 2048 bits obtidas da JWKS do tenant.
2. Assinatura verificada **antes** de qualquer uso das claims. Decodificar não é validar.
3. Claims: `iss = https://login.microsoftonline.com/<tid>/v2.0`, `aud` ∈ {client ID da API,
   Application ID URI}, `tid` = tenant configurado, `ver = 2.0`, `exp`/`nbf`/`iat` com tolerância
   de 60 s, `scp` contém o escopo exigido, `azp` ∈ `ENTRA_ALLOWED_CLIENT_IDS` (quando configurado),
   `oid` em formato GUID.
4. Falhas respondem `401 INVALID_TOKEN` com `WWW-Authenticate: Bearer error="invalid_token"`,
   sem detalhar o motivo ao cliente. O motivo (`INVALID_SIGNATURE`, `UNKNOWN_KEY`,
   `UNSUPPORTED_ALGORITHM`, `INVALID_ISSUER`, `INVALID_AUDIENCE`, `INVALID_TENANT`,
   `INVALID_VERSION`, `EXPIRED`, `NOT_YET_VALID`, `INSUFFICIENT_SCOPE`, `CLIENT_NOT_ALLOWED`,
   `MISSING_SUBJECT`, `MALFORMED`) é registrado no log (`event: access_token_rejected`), nunca o
   token. Ausência de token: `401 MISSING_TOKEN`.

## 4. Identidade local e provisionamento

* Chave permanente: `external_identities (provider='entra-id', tenant_id, subject=oid)` →
  `users.id`. O e-mail/UPN é apenas atributo de exibição (pode mudar; não identifica a pessoa).
* Primeiro acesso: o usuário é criado **sem papéis** (`USER_PROVISIONED` na auditoria, gravado na
  mesma transação da criação) e recebe
  403 nas rotas protegidas até um administrador conceder papéis. Claims `roles`/`groups` do token
  são ignoradas.
* Nome e e-mail exibidos são atualizados a partir do token no máximo a cada 5 minutos.
* Usuário `INACTIVE` recebe `403 USER_INACTIVE` mesmo com token válido.

## 5. Primeiro administrador (bootstrap) e recuperação

Não existe usuário padrão, senha inicial ou rota de bootstrap. Procedimento:

1. A pessoa que será administradora acessa o web uma vez (é provisionada sem papéis).
2. Um operador com acesso ao banco (ou ao contêiner da API) executa:
   ```bash
   npm run admin:grant-role -- --tenant-id <tid> --object-id <oid-da-pessoa> --role ADMIN
   # em contêiner (Azure): az containerapp exec ... --command "node dist/database/grant-role.js --tenant-id <tid> --object-id <oid> --role ADMIN"
   ```
   O `oid` aparece no Entra (Usuários → Object ID). A concessão é auditada
   (`USER_ROLE_GRANTED_CLI`).
3. Demais papéis são concedidos pela interface (Administração → Usuários) por quem tem
   `users:manage`. Salvaguardas: ninguém altera os próprios papéis nem desativa a si próprio;
   apenas administradores concedem/retiram `ADMIN` ou alteram contas de administradores; os papéis
   de quem executa são relidos no momento da alteração; o último `ADMIN` ativo é preservado.

## 6. Problemas comuns

A API responde `401 INVALID_TOKEN`; o diagnóstico está no campo `reason` do log
`access_token_rejected` da API.

| `reason` no log / sintoma | Causa provável |
| --- | --- |
| `INVALID_VERSION` ou `INVALID_ISSUER` | Registro da API emitindo tokens v1 (`requestedAccessTokenVersion` ausente) |
| `INVALID_AUDIENCE` | SPA pedindo token de outra API (ex.: `User.Read`) ou `ENTRA_API_AUDIENCE` divergente |
| `INSUFFICIENT_SCOPE` | Escopo `access_as_user` não solicitado/consentido |
| `CLIENT_NOT_ALLOWED` | `azp` do token (SPA) fora de `ENTRA_ALLOWED_CLIENT_IDS` |
| `UNKNOWN_KEY` + log `jwks_refresh_failed` | Saída para `login.microsoftonline.com` bloqueada na rede |
| 403 `INSUFFICIENT_PERMISSIONS` logo após o login | Usuário novo sem papéis — conceder pela administração |

> Os motivos estão definidos em `src/modules/auth/infrastructure/jwt/access-token.verifier.ts`.
