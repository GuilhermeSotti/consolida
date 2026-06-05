# Passo 11 — Segurança Aplicada ao Código e Infraestrutura

## Resumo de Implementação

Este documento descreve as implementações de segurança realizadas no ConsolidaHub em duas frentes: **NestJS** e **Kubernetes**.

---

## NestJS — Hardening de Aplicação

### 1. Validação Global com `ValidationPipe`

**Arquivo:** [src/main.ts](src/main.ts)

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

**Efeito:**
- Remove campos não declarados no DTO (`whitelist: true`)
- Rejeita requisições com campos inválidos (`forbidNonWhitelisted: true`)
- Transforma dados conforme tipos esperados (`transform: true`)
- Previne injeção de dados malformados

---

### 2. Headers de Segurança com `Helmet`

**Arquivo:** [src/main.ts](src/main.ts)

```typescript
import helmet from 'helmet';
app.use(helmet());
```

**Headers aplicados:**
- `Content-Security-Policy` — Previne injeção de scripts
- `X-Frame-Options` — Previne clickjacking
- `X-Content-Type-Options` — Força MIME type correto
- `Strict-Transport-Security` — Força HTTPS
- `X-XSS-Protection` — Proteção contra XSS

---

### 3. CORS Restritivo

**Arquivo:** [src/main.ts](src/main.ts)

```typescript
app.enableCors({
  origin: [
    process.env.CORS_ORIGIN_1 || 'http://localhost:3001',
    process.env.CORS_ORIGIN_2 || 'http://localhost:3002',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
});
```

**Efeito:**
- Apenas origens permitidas podem acessar
- Credenciais incluídas nas requisições
- Apenas métodos HTTP necessários
- Headers específicos validados

---

### 4. Rate Limiting

**Arquivo:** [src/app.module.ts](src/app.module.ts)

```typescript
ThrottlerModule.forRoot([
  {
    name: 'default',
    ttl: 60000,
    limit: 100,
  },
  {
    name: 'auth',
    ttl: 60000,
    limit: 5,
  },
]),
```

**Configuração:**
- `default`: 100 requisições/minuto (rotas normais)
- `auth`: 5 requisições/minuto (autenticação)

**Uso em Controllers:**

```typescript
@Throttle({ auth: { limit: 5, ttl: 60000 } })
@Post('login')
async login(@Body() loginDto: LoginDto) { }

@SkipThrottle()
@Get('health')
health() { }
```

---

### 5. Guards para RBAC

**Arquivos criados:**
- [src/common/guards/jwt-auth.guard.ts](src/common/guards/jwt-auth.guard.ts)
- [src/common/guards/roles.guard.ts](src/common/guards/roles.guard.ts)
- [src/common/guards/permissions.guard.ts](src/common/guards/permissions.guard.ts)
- [src/common/decorators/authorization.decorator.ts](src/common/decorators/authorization.decorator.ts)

**Uso:**

```typescript
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'FUNCTIONAL_ADMIN')
@Permissions('rules:create')
@Post('/rules')
createRule() { }
```

**Fluxo de validação:**
1. `JwtAuthGuard` — Valida autenticação JWT
2. `RolesGuard` — Valida papel do usuário (`ADMIN`, `USER`, etc)
3. `PermissionsGuard` — Valida permissão de ação (`rules:create`, `reports:read`, etc)

---

### 6. Autorização por Objeto (BOLA Prevention)

**Onde implementar:** Em cada use case que acessa recursos por ID

```typescript
// exemplo em RulesService
async getRule(id: string, currentUser: User): Promise<Rule> {
  const rule = await this.prisma.rule.findUnique({ where: { id } });
  
  if (!rule) {
    throw new NotFoundException();
  }
  
  // Checar se usuário tem acesso ao objeto
  if (rule.createdBy !== currentUser.id && 
      !currentUser.permissions.includes('rules:read:any')) {
    throw new ForbiddenException('Acesso negado a este recurso');
  }
  
  return rule;
}
```

**Recursos sensíveis:**
- `rules` — Validar posse ou `rules:read:any`
- `executions` — Validar posse ou `executions:read:any`
- `reports` — Validar posse ou `reports:read:any`

---

## Kubernetes — Hardening de Infraestrutura

### 1. SecurityContext Restritivo

**Arquivo:** [infra/k8s/base/deployment.yaml](infra/k8s/base/deployment.yaml)

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  fsGroup: 10001
  seccompProfile:
    type: RuntimeDefault

containers:
  - name: api
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
      seccompProfile:
        type: RuntimeDefault
```

**Efeito:**
- Executa como usuário não-root (`uid: 10001`)
- Nega escalada de privilégio
- Filesystem somente leitura
- Remove todas as Linux capabilities
- Usa seccomp RuntimeDefault

---

### 2. NetworkPolicy

**Arquivo:** [infra/k8s/base/networkpolicy.yaml](infra/k8s/base/networkpolicy.yaml)

**Ingress:**
- Apenas do ingress-nginx (`port: 3000`)
- Apenas do namespace monitoring para métricas

**Egress:**
- PostgreSQL: `port: 5432` (namespace `data`)
- Redis: `port: 6379` (namespace `data`)
- DNS: `port: 53` (UDP)
- HTTPS: `port: 443` (APIs externas)

**Efeito:** Tráfego bloqueado por padrão; apenas fluxos explícitos são permitidos.

---

### 3. Pod Security Admission

**Arquivo:** [infra/k8s/base/namespace.yaml](infra/k8s/base/namespace.yaml)

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: consolidahub
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

**Efeito:** Força que todos os Pods no namespace sigam `Pod Security Standard: restricted`.

---

### 4. RBAC de Menor Privilégio

**Arquivo:** [infra/k8s/base/rbac.yaml](infra/k8s/base/rbac.yaml)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: consolidahub-api
rules:
# Intencionalmente vazio — sem acesso à API do Kubernetes
- apiGroups: [""]
  resources: [""]
  verbs: []
```

**Prática:** ConsolidaHub API não precisa de acesso à API do Kubernetes. A Role está vazia e deve permanecer assim, a menos que haja necessidade comprovada.

---

### 5. Secrets e Configuração

**Arquivo:** [infra/k8s/base/configmap.yaml](infra/k8s/base/configmap.yaml) e [infra/k8s/base/secret.yaml](infra/k8s/base/secret.yaml)

**ConfigMap** (dados públicos):
- `NODE_ENV`, `PORT`, `LOG_LEVEL`
- `CORS_ORIGIN_1`, `CORS_ORIGIN_2`

**Secret** (dados sensíveis):
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- Credenciais Entra ID

**Deployment** utiliza `envFrom`:

```yaml
envFrom:
  - configMapRef:
      name: consolidahub-config
  - secretRef:
      name: consolidahub-secrets
```

---

### 6. Dockerfile com Usuário Não-Root

**Arquivo:** [Dockerfile](Dockerfile)

```dockerfile
RUN addgroup -g 10001 -S nodejs && \
    adduser -S nestjs -u 10001

USER nestjs
```

**Efeito:** Container roda como `uid: 10001`, nunca como `root`.

---

## Checklist de Produção

- [x] `ValidationPipe` global com `whitelist` e `forbidNonWhitelisted`
- [x] `Helmet` configurado para headers de segurança
- [x] CORS apenas para origens permitidas
- [x] Rate limiting: `default: 100/min`, `auth: 5/min`
- [x] Guards de autenticação, roles e permissions
- [x] Validação por objeto em rotas sensíveis (TODO: implementar em controllers específicos)
- [x] Secrets fora do código
- [x] `securityContext` restritivo no Pod
- [x] `NetworkPolicy` para limitar tráfego
- [x] Pod Security Admission: `restricted`
- [x] RBAC de menor privilégio
- [x] Dockerfile com usuário não-root (`uid: 10001`)
- [ ] Tratamento de erros genéricos em produção (implementar em exception filter)
- [ ] Sanitização de logs para evitar injeção

---

## Próximos Passos

### 1. Implementar Autorização por Objeto

Atualizar cada controller sensível com validação de acesso por objeto:

```typescript
// Em rules.controller.ts, executions.controller.ts, reports.controller.ts
async getById(@Param('id') id: string, @CurrentUser() user) {
  const resource = await this.service.findById(id);
  
  if (resource.ownerId !== user.id && !user.permissions.includes('resource:read:any')) {
    throw new ForbiddenException();
  }
  
  return resource;
}
```

### 2. Tratamento de Erros Genéricos

Atualizar [src/common/filters/all-exceptions.filter.ts](src/common/filters/all-exceptions.filter.ts):

```typescript
// Em produção, não expor stack traces
if (process.env.NODE_ENV === 'production') {
  return {
    statusCode: exception.getStatus(),
    message: 'Internal server error',
  };
}
```

### 3. Sanitização de Logs

Atualizar [src/observability/request-logging.interceptor.ts](src/observability/request-logging.interceptor.ts):

```typescript
// Remover tokens, senhas, dados sensíveis do log
const sanitizeBody = (obj: any) => {
  // Remover JWT, passwords, etc
  if (obj.password) delete obj.password;
  if (obj.token) delete obj.token;
  return obj;
};
```

### 4. Testes de Segurança

- [ ] Testar CORS rejection com origem inválida
- [ ] Testar rate limiting com múltiplas requisições
- [ ] Testar ValidationPipe rejeitando campos extras
- [ ] Testar autenticação sem JWT
- [ ] Testar autorização por objeto (BOLA)

---

## Referências

- **OWASP Top 10 2021**
  - A01:2021 – Broken Access Control (BOLA)
  - A07:2021 – Cross-Site Scripting (XSS)
  - A10:2021 – Server-Side Request Forgery (SSRF)

- **NestJS Security**
  - [Authentication](https://docs.nestjs.com/security/authentication)
  - [Authorization](https://docs.nestjs.com/security/authorization)
  - [Encryption & Hashing](https://docs.nestjs.com/security/encryption-and-hashing)

- **Kubernetes Security**
  - [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
  - [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
  - [RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
