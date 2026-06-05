# Segurança por Ambiente

## Development (dev)

**Foco:** Facilitar desenvolvimento local

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
CORS_ORIGIN_1=http://localhost:3001
CORS_ORIGIN_2=http://localhost:3002
```

- Secrets em `.env.local` (gitignored)
- CORS aberto para localhost
- Rate limiting: não aplica em health checks
- Validação de objeto: ativa

## Staging (hml)

**Foco:** Replicar produção com dados seguros

```env
NODE_ENV=staging
LOG_LEVEL=info
CORS_ORIGIN_1=https://app-staging.consolidahub.com
CORS_ORIGIN_2=https://desktop-staging.consolidahub.com
```

- Secrets do Azure Key Vault
- CORS para domínios staging
- Rate limiting: ativo
- Validação de objeto: ativa
- Sem expor stack traces

## Production (prod)

**Foco:** Máxima segurança

```env
NODE_ENV=production
LOG_LEVEL=warn
CORS_ORIGIN_1=https://app.consolidahub.com
CORS_ORIGIN_2=https://desktop.consolidahub.com
```

- **Todos os secrets do Key Vault**
- CORS restritivo
- Rate limiting: agressivo em auth
- Validação de objeto: obrigatória
- Sem dados sensíveis em logs
- Exception filter genérico
- Helm values overrides para produção

---

## Implementação do Exception Filter

Para remover stack traces em produção:

```typescript
// src/common/filters/all-exceptions.filter.ts

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let message = 'Internal server error';
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    }

    // Em desenvolvimento, expor detalhes
    if (process.env.NODE_ENV !== 'production') {
      details = exception instanceof Error ? exception.stack : String(exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      ...(details && { details }),
    });
  }
}
```

---

## Sanitização de Logs

Para evitar exposição de dados sensíveis:

```typescript
// src/observability/request-logging.interceptor.ts

private sanitizeLogs(obj: any): any {
  const sensitiveKeys = [
    'password',
    'token',
    'jwt',
    'secret',
    'key',
    'apiKey',
    'authorization',
  ];

  const sanitized = JSON.parse(JSON.stringify(obj));
  
  const sanitizeObject = (target: any) => {
    Object.keys(target).forEach((key) => {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        target[key] = '***REDACTED***';
      } else if (typeof target[key] === 'object') {
        sanitizeObject(target[key]);
      }
    });
  };

  sanitizeObject(sanitized);
  return sanitized;
}
```

---

## Checklist: Release para Produção

- [ ] Environment variables verificadas (none hardcoded)
- [ ] Secrets no Key Vault/Vault
- [ ] Rate limiting configurado
- [ ] CORS domínios corretos
- [ ] Exception filter sem stack trace
- [ ] Logs sanitizados
- [ ] ValidationPipe com forbidNonWhitelisted
- [ ] Helmet ativo
- [ ] Guards em rotas sensíveis
- [ ] Validação por objeto em rules/executions/reports
- [ ] Pod Security Standards: restricted
- [ ] NetworkPolicy: ativo
- [ ] RBAC: menor privilégio
- [ ] SecurityContext: uid 10001
- [ ] TLS/HTTPS: configurado
- [ ] Health checks: skipThrottle
- [ ] Audit logs: ativo
