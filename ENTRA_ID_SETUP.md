# Guia de Integração com Microsoft Entra ID

## Visão Geral

O ConsolidaHub implementa um sistema de autenticação e autorização corporativa utilizando Microsoft Entra ID (Azure AD) com OpenID Connect (OIDC). Este guia detalha os passos necessários para configurar a integração.

## 1. Registrar Aplicação no Entra ID

### Passos no Azure Portal

1. Acesse [Azure Portal](https://portal.azure.com)
2. Navegue para **Azure Active Directory** → **App registrations**
3. Clique em **New registration**
4. Preencha os dados:
   - **Name**: ConsolidaHub API
   - **Supported account types**: Escolha conforme sua organização
   - **Redirect URI**: Deixe em branco por enquanto (será configurado depois)
5. Clique em **Register**

### Configurar Redirect URIs

1. Na aplicação registrada, vá para **Authentication**
2. Em **Redirect URIs**, adicione:
   - `http://localhost:3000/api/v1/auth/callback` (desenvolvimento)
   - `https://api.consolidahub.com/api/v1/auth/callback` (produção)
3. Salve

### Criar Client Secret

1. Vá para **Certificates & secrets**
2. Em **Client secrets**, clique em **New client secret**
3. Adicione descrição e defina validade
4. **Copie o value** (você não conseguirá vê-lo depois)

### Obter IDs

1. Na página **Overview**, copie:
   - **Application (client) ID**: `ENTRA_CLIENT_ID`
   - **Directory (tenant) ID**: `ENTRA_TENANT_ID`

## 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
# Entra ID
ENTRA_TENANT_ID=seu-tenant-id
ENTRA_CLIENT_ID=seu-client-id
ENTRA_CLIENT_SECRET=seu-client-secret
ENTRA_AUTHORITY=https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0
ENTRA_ISSUER=https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0
ENTRA_JWKS_URI=https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys

# Backend
JWT_SECRET=sua-chave-secreta-local
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/consolidahub
```

## 3. Configurar Scopes no Entra ID

1. Na aplicação registrada, vá para **API permissions**
2. Clique em **Add a permission**
3. Selecione **Microsoft Graph**
4. Escolha **Delegated permissions**
5. Procure e selecione:
   - `User.Read`
   - `email`
   - `profile`
   - `offline_access`
6. Clique em **Add permissions**
7. Clique em **Grant admin consent** (se você for admin)

## 4. Configurar Audience (Scope da Aplicação)

1. Na aplicação, vá para **Expose an API**
2. Em **Application ID URI**, configure:
   - URI: `api://consolidahub` ou `api://{ENTRA_CLIENT_ID}`
3. Em **Scopes defined by this API**, clique em **Add a scope**
4. Configure:
   - **Scope name**: `access_as_user`
   - **Admin consent display name**: Access ConsolidaHub as a user
   - **Admin consent description**: Allows the app to access ConsolidaHub on behalf of the user
5. Salve

## 5. Fluxo de Autenticação

### Frontend (não implementado aqui)

```javascript
// Usando MSAL (Microsoft Authentication Library)
import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: process.env.REACT_APP_ENTRA_CLIENT_ID,
    authority: process.env.REACT_APP_ENTRA_AUTHORITY,
    redirectUri: window.location.origin + "/auth/callback",
  },
};

const pca = new PublicClientApplication(msalConfig);

// Iniciar login
pca.loginPopup({
  scopes: ["user.read"],
});
```

### Backend (NestJS)

O fluxo no backend funciona assim:

1. **Frontend obtém token do Entra ID**
2. **Frontend envia token ao endpoint `/api/v1/auth/validate-token`**
3. **Backend valida assinatura, issuer e audience**
4. **Backend sincroniza usuário local (cria ou atualiza)**
5. **Backend atribui roles e permissions baseado nas regras locais**
6. **Backend retorna sessão ao frontend**

### Exemplo de Request

```bash
curl -X POST http://localhost:3000/api/v1/auth/validate-token \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ..."
  }'
```

### Exemplo de Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "usuario@empresa.com",
  "displayName": "Usuário Teste",
  "entraSub": "user-oid-from-entra",
  "roles": ["BUSINESS_ANALYST"],
  "permissions": [
    "rules:view",
    "rules:create",
    "reports:view"
  ]
}
```

## 6. Definir Roles e Permissions Locais

### Roles Disponíveis

- **ADMIN**: Controle total do sistema
- **FUNCTIONAL_ADMIN**: Administração de funcionalidades
- **BUSINESS_ANALYST**: Análise de negócios
- **OPERATIONS**: Operações diárias
- **MANAGER**: Gerenciamento
- **VIEWER**: Apenas visualização

### Permissions

Permissões são granulares e seguem o formato `resource:action`:

```
rules:view
rules:create
rules:update
rules:deactivate
sources:create
sources:update
executions:run
executions:cancel
reports:view
reports:export
users:manage
permissions:manage
```

### Como Atribuir Roles e Permissions

#### Via API (Admin)

```bash
POST /api/v1/users/{userId}/roles
Content-Type: application/json
Authorization: Bearer {admin-token}

{
  "roles": ["BUSINESS_ANALYST", "OPERATIONS"]
}
```

#### Via Database (Direct)

```sql
-- Criar role
INSERT INTO roles (id, name, description)
VALUES ('role-uuid', 'CUSTOM_ROLE', 'Descrição');

-- Criar permission
INSERT INTO permissions (id, resource, action, description)
VALUES ('perm-uuid', 'rules', 'approve', 'Aprovar regras');

-- Atribuir role ao usuário
INSERT INTO "User_Role" (id, user_id, role_id)
VALUES ('uuid', 'user-uuid', 'role-uuid');

-- Atribuir permission ao usuário
INSERT INTO "User_Permission" (id, user_id, permission_id)
VALUES ('uuid', 'user-uuid', 'perm-uuid');
```

## 7. Validação de Token (Backend)

A validação acontece em três camadas:

### 1. Assinatura do Token

```typescript
// O token deve ser assinado com a chave pública do Entra ID
// Baixada do JWKS endpoint
```

### 2. Claims Obrigatórios

```typescript
{
  "sub": "user-oid",           // Subject (obrigatório)
  "email": "user@company.com",  // Email (obrigatório)
  "aud": "api://consolidahub",  // Audience (deve corresponder)
  "iss": "https://...",        // Issuer (deve corresponder)
  "exp": 1234567890,           // Expiration (verificado)
  "iat": 1234567800            // Issued at
}
```

### 3. Sincronização de Usuário Local

- Se usuário existe → atualiza dados
- Se não existe → cria usuário novo
- Carrega roles e permissions da base local

## 8. Proteger Endpoints

### Usar Guards e Decorators

```typescript
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.FUNCTIONAL_ADMIN)
@Permissions('rules:create', 'rules:update')
@Post('rules')
async createRule(
  @Body() dto: CreateRuleDto,
  @CurrentUser() user: UserSessionEntity,
) {
  return this.rulesService.create(dto, user.id);
}
```

### Decorators Disponíveis

- `@UseGuards(JwtAuthGuard)`: Valida token
- `@UseGuards(RolesGuard)`: Valida roles
- `@UseGuards(PermissionsGuard)`: Valida permissions
- `@Roles(...)`: Define roles necessárias
- `@Permissions(...)`: Define permissions necessárias
- `@CurrentUser()`: Injeta usuário autenticado

## 9. Auditoria

Todos os eventos de autenticação são registrados em `auth_logs`:

```sql
SELECT * FROM auth_logs
WHERE action IN ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PERMISSION_DENIED')
ORDER BY created_at DESC;
```

### Eventos Registrados

- **LOGIN**: Login bem-sucedido
- **LOGIN_FAILED**: Falha na autenticação
- **LOGOUT**: Logout
- **PERMISSION_DENIED**: Acesso negado
- **TOKEN_EXPIRED**: Token expirado
- **TOKEN_INVALID**: Token inválido

## 10. Troubleshooting

### Token rejeitado: "Invalid issuer"

- Verifique se o issuer do token corresponde a `ENTRA_ISSUER`
- O issuer deve ser: `https://login.microsoftonline.com/{ENTRA_TENANT_ID}/v2.0`

### Token rejeitado: "Invalid audience"

- Verifique se o scope/audience do token corresponde
- Configure o scope como `api://consolidahub` no Entra ID

### Token expirado

- Implemente refresh token flow
- Tokens geralmente expiram em 60 minutos
- Use refresh tokens para obter novos access tokens

### Usuário criado mas sem roles

- Atribua roles manualmente via API ou database
- Roles não são sincronizadas do Entra ID por padrão
- Isso é intencional para permitir controle fino local

## 11. Próximas Etapas

1. **Implementar frontend com MSAL**: Use a biblioteca `@azure/msal-react`
2. **Configurar refresh token flow**: Para melhor experiência do usuário
3. **Implementar logout federado**: Redirecionar para logout do Entra ID
4. **Adicionar MFA**: Entra ID suporta autenticação multifator
5. **Implementar audit logs detalhados**: Registre todas as ações
6. **Configurar alertas de segurança**: Para eventos suspeitos

## Referências

- [Microsoft Identity Platform](https://learn.microsoft.com/en-us/azure/active-directory/develop/)
- [OpenID Connect in Azure AD](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-protocols-oidc)
- [MSAL for JavaScript](https://github.com/AzureAD/microsoft-authentication-library-for-js)
- [NestJS JWT Authentication](https://docs.nestjs.com/security/authentication)
- [NestJS Authorization](https://docs.nestjs.com/security/authorization)
