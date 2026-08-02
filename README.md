# ConsolidaHub

ConsolidaHub é um motor de consolidação de dados parametrizado implementado em NestJS + TypeScript.

Principais módulos:
- `Auth`: autenticação e sessões (EntraID)
- `Rules`: CRUD e execução de regras de negócio
- `Sources`: cadastro de fontes (Excel, SQL, SharePoint)
- `Executions`: orquestrador do pipeline de consolidação
- `Reports`: persistência e consulta de relatórios consolidados

Quick start

1. Instalar dependências:

```bash
npm install
```

2. Gerar Prisma Client:

```bash
npm run prisma:generate
```

3. Rodar testes:

```bash
npm test
# cobertura
npm run test:cov
```

4. Rodar em modo dev (Nest):

```bash
npm run dev
```

Estrutura e próximos passos
- Veja `docs/ARCHITECTURE.md` para diagrama e descrição arquitetural.
- Módulos scaffolded: `Sources`, `Loaders` (Excel/SQL/SharePoint), `Executions` orquestrador básico e `Reports`.

Contribua criando PRs com testes e mantendo os padrões de Clean Architecture do projeto.
