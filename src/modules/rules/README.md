# Módulo Rules - ConsolidaHub

## 📋 Visão Geral

O módulo **Rules** implementa o CRUD completo de regras de consolidação com uma arquitetura profissional baseada em Clean Architecture e padrões SOLID.

## 🏗️ Arquitetura

```
src/modules/rules/
├── domain/                      # Camada de Domínio (núcleo de negócio)
│   ├── entities/
│   │   └── rule.entity.ts       # Entidade com métodos de negócio
│   ├── enums/
│   │   └── rule-status.enum.ts  # Estados possíveis
│   └── repositories/
│       └── rules.repository.ts  # Contrato abstrato
│
├── application/                 # Camada de Aplicação (casos de uso)
│   ├── dto/
│   │   ├── create-rule.dto.ts   # Validação de entrada
│   │   ├── update-rule.dto.ts
│   │   └── query-rules.dto.ts
│   └── use-cases/               # Orquestração de negócio
│       ├── create-rule.use-case.ts
│       ├── list-rules.use-case.ts
│       ├── get-rule.use-case.ts
│       ├── update-rule.use-case.ts
│       ├── deactivate-rule.use-case.ts
│       ├── activate-rule.use-case.ts
│       └── get-rule-versions.use-case.ts
│
├── infrastructure/              # Camada de Infraestrutura (persistência)
│   └── persistence/
│       └── prisma-rules.repository.ts
│
├── presentation/                # Camada de Apresentação (API)
│   └── rules.controller.ts      # Endpoints HTTP
│
└── rules.module.ts              # Configuração do módulo
```

## 🎯 Padrões Aplicados

### Clean Architecture
- Separação clara entre camadas
- Dependências apontam para dentro
- Fácil testar cada camada independentemente

### Domain-Driven Design (DDD)
- Entidade de domínio com lógica de negócio
- Repositório abstrato desacoplado de implementação
- Enums para estados válidos

### SOLID
- **S**ingle Responsibility: cada classe tem uma responsabilidade
- **O**pen/Closed: aberto para extensão, fechado para modificação
- **L**iskov Substitution: RulesRepository abstrato
- **I**nterface Segregation: DTOs específicos por caso de uso
- **D**ependency Inversion: injeção de dependência via NestJS

### Repository Pattern
- Abstração de persistência
- Fácil trocar de banco de dados
- Testável sem banco de dados real

## 📡 API Endpoints

### Criar Regra
```
POST /api/v1/rules
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Regra de Aprovação",
  "description": "Valida cadastro completo",
  "sourceIds": ["550e8400-e29b-41d4-a716-446655440000"],
  "conditions": { ... },
  "actions": { ... },
  "priority": 0,
  "status": "ACTIVE"
}
```

### Listar Regras
```
GET /api/v1/rules?page=1&pageSize=20&status=ACTIVE&search=Aprovação&sortBy=createdAt&sortOrder=desc
Authorization: Bearer <token>
```

### Obter Regra
```
GET /api/v1/rules/:id
Authorization: Bearer <token>
```

### Atualizar Regra
```
PATCH /api/v1/rules/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Novo nome",
  "status": "INACTIVE"
}
```

### Deletar Regra
```
DELETE /api/v1/rules/:id
Authorization: Bearer <token>
```

### Listar Versões
```
GET /api/v1/rules/:id/versions?page=1&pageSize=20
Authorization: Bearer <token>
```

### Ativar Regra
```
POST /api/v1/rules/:id/activate
Authorization: Bearer <token>
```

### Desativar Regra
```
POST /api/v1/rules/:id/deactivate
Authorization: Bearer <token>
```

## 🔐 Funcionalidades

✅ **CRUD Completo**
- Criar, ler, atualizar, deletar regras
- Validação automática de entrada

✅ **Paginação**
- `page` e `pageSize` em todas as listas
- Retorna total de itens e páginas

✅ **Filtros**
- Por `status` (ACTIVE/INACTIVE)
- Por `search` (nome ou descrição)
- Por `sortBy` (name, createdAt, version)
- Por `sortOrder` (asc, desc)

✅ **Versionamento**
- Incrementa versão a cada atualização
- Histórico de versões consultável
- Rastreabilidade de mudanças

✅ **Auditoria**
- Registra `createdBy` e `updatedBy`
- Timestamps automáticos
- Preparado para audit logs

✅ **Segurança**
- JWT Bearer obrigatório
- Validação de entrada com class-validator
- Tratamento de erros padronizado

✅ **Observabilidade**
- Logs estruturados
- Monitoramento preparado
- Timestamps em UTC

## 🗄️ Schema Prisma

```prisma
model Rule {
  id          String   @id @db.Uuid
  name        String   @db.VarChar(255)
  description String?  @db.Text
  version     Int      @default(1)
  status      String   @db.VarChar(50)

  sourceIds   String[] @db.Uuid
  conditions  Json
  actions     Json
  priority    Int      @default(0)

  createdBy   String   @db.Uuid
  updatedBy   String?  @db.Uuid

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("rules")
  @@index([status])
  @@index([createdAt])
  @@index([createdBy])
}
```

## 🧪 Testabilidade

A arquitetura facilita testes em múltiplos níveis:

### Testes Unitários - Camada de Domínio
```typescript
describe('RuleEntity', () => {
  it('should deactivate rule', () => {
    const rule = new RuleEntity();
    rule.status = RuleStatus.ACTIVE;
    rule.deactivate();
    expect(rule.status).toBe(RuleStatus.INACTIVE);
  });
});
```

### Testes de Casos de Uso
```typescript
describe('CreateRuleUseCase', () => {
  it('should create rule', async () => {
    const mockRepository = mock(RulesRepository);
    const useCase = new CreateRuleUseCase(mockRepository.instance);
    
    const result = await useCase.execute(dto, userId);
    expect(result.id).toBeDefined();
  });
});
```

### Testes de Integração
```typescript
describe('RulesController (e2e)', () => {
  it('POST /rules should create rule', () => {
    return request(app.getHttpServer())
      .post('/api/v1/rules')
      .set('Authorization', `Bearer ${token}`)
      .send(createRuleDto)
      .expect(201);
  });
});
```

## 🚀 Próximos Passos

1. **Implementar módulos dependentes**
   - Users
   - Auth
   - Permissions

2. **Adicionar observabilidade**
   - Winston logs
   - Sentry para erros
   - OpenTelemetry para traces

3. **Implementar audit trail**
   - Persistir histórico de mudanças
   - Rastreamento de quem fez o quê

4. **Adicionar testes**
   - Unit tests (domain, use-cases)
   - Integration tests (controller)
   - E2E tests (completo)

5. **Executar regras**
   - Criar execution engine
   - Processar condições e ações
   - Persistir resultados

## 📚 Referências

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma ORM](https://www.prisma.io)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Domain-Driven Design](https://www.domainlanguage.com/ddd/)
