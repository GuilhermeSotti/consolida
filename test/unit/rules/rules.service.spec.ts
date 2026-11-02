import { RulesService } from '../../../src/modules/rules/application/rules.service';
import { ConflictError, UnprocessableError, ValidationError } from '../../../src/shared/domain/errors';
import { failure, FakeAudit, FakeTransactions, principal, uuid } from '../../support/fakes';
import { InMemoryRules } from '../../support/in-memory-rules';
import { InMemorySources, sourceView } from '../../support/in-memory-sources';

const analyst = principal(['BUSINESS_ANALYST']);
const filterDefinition = { condition: { column: 'status', operator: 'EQUALS', values: ['ATIVO'] } };

function setup() {
  const rules = new InMemoryRules();
  const sources = new InMemorySources();
  const audit = new FakeAudit();
  const target = sources.add(sourceView({ code: 'ALVO' }));
  const reference = sources.add(sourceView({ code: 'REF' }));
  return { rules, sources, audit, target, reference, service: new RulesService(rules, sources, new FakeTransactions(), audit) };
}

describe('RulesService.create', () => {
  it('validates and canonicalizes the definition, creates version 1 INACTIVE and audits', async () => {
    const { service, target, audit } = setup();
    const rule = await service.create(analyst, {
      type: 'FILTER',
      targetSourceId: target.id,
      name: 'Somente ativos',
      description: null,
      phase: null,
      executionOrder: 10,
      definition: filterDefinition,
      changeReason: null,
    });
    expect(rule.status).toBe('INACTIVE');
    expect(rule.currentVersion).toBe(1);
    expect(rule.current.definition).toEqual({
      condition: { column: 'STATUS', operator: 'EQUALS', values: ['ATIVO'], normalization: [], compareAs: 'AUTO' },
    });
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'RULE_CREATED', inTransaction: true })]);
  });

  it('rejects invalid definitions with field-level details', async () => {
    const { service, target } = setup();
    const error = await failure(
      service.create(analyst, { type: 'FILTER', targetSourceId: target.id, name: 'x', description: null, phase: null, executionOrder: 0, definition: { condition: { column: 'A', operator: 'LIKE', values: [] } }, changeReason: null }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('INVALID_RULE_DEFINITION');
  });

  it('checks the target and reference sources of LOOKUP rules', async () => {
    const { service, target, reference } = setup();
    const lookup = (referenceSourceIds: string[]) => ({
      keyColumns: ['FORNECEDOR'],
      referenceSourceIds,
      referenceKeyColumns: ['CODIGO'],
      columnsToBring: ['NOME'],
      matchMode: 'EXACT',
    });
    const base = { type: 'LOOKUP' as const, name: 'Matriz', description: null, phase: null, executionOrder: 0, changeReason: null };
    await expect(service.create(analyst, { ...base, targetSourceId: target.id, definition: lookup([reference.id]) })).resolves.toBeDefined();
    expect((await failure(service.create(analyst, { ...base, targetSourceId: uuid(1), definition: lookup([reference.id]) }))).code).toBe('TARGET_SOURCE_NOT_FOUND');
    const missing = await failure(service.create(analyst, { ...base, targetSourceId: target.id, definition: lookup([uuid(2)]) }));
    expect(missing).toBeInstanceOf(UnprocessableError);
    expect(missing.code).toBe('REFERENCE_SOURCE_NOT_FOUND');
    expect((await failure(service.create(analyst, { ...base, targetSourceId: target.id, definition: lookup([target.id]) }))).code).toBe('INVALID_RULE_DEFINITION');
  });
});

describe('RulesService.update (immutable versioning)', () => {
  function seeded() {
    const context = setup();
    const rule = context.rules.seed('FILTER', context.target.id, {
      name: 'Somente ativos',
      description: null,
      phase: null,
      executionOrder: 1,
      definition: { condition: { column: 'STATUS', operator: 'EQUALS', values: ['ATIVO'], normalization: [], compareAs: 'AUTO' } },
    });
    return { ...context, rule };
  }

  it('creates version N+1 and keeps the previous version untouched', async () => {
    const { service, rule, rules, audit } = seeded();
    const updated = await service.update(analyst, rule.id, { expectedVersion: 1, name: 'Ativos e suspensos', changeReason: 'Inclui suspensos' });
    expect(updated.currentVersion).toBe(2);
    expect(updated.current.name).toBe('Ativos e suspensos');
    expect((await rules.findVersion(rule.id, 1))!.name).toBe('Somente ativos');
    expect(audit.entries[0]).toEqual(
      expect.objectContaining({ action: 'RULE_UPDATED', details: expect.objectContaining({ fromVersion: 1, toVersion: 2, changedFields: ['name'] }) }),
    );
  });

  it('returns 409 for a stale expectedVersion, a lost race or an update without changes', async () => {
    const { service, rule, rules } = seeded();
    expect((await failure(service.update(analyst, rule.id, { expectedVersion: 3, name: 'x', changeReason: 'abc' }))).code).toBe('RULE_VERSION_CONFLICT');
    rules.loseNextRace = true;
    const race = await failure(service.update(analyst, rule.id, { expectedVersion: 1, name: 'y', changeReason: 'abc' }));
    expect(race).toBeInstanceOf(ConflictError);
    expect(race.code).toBe('RULE_VERSION_CONFLICT');
    const unchanged = await failure(service.update(analyst, rule.id, { expectedVersion: 2, name: 'Somente ativos', changeReason: 'abc' }));
    expect(unchanged.code).toBe('RULE_UNCHANGED');
  });

  it('activates and deactivates idempotently with audit', async () => {
    const { service, rule, audit } = seeded();
    await service.setStatus(rule.id, 'ACTIVE');
    await service.setStatus(rule.id, 'INACTIVE');
    await service.setStatus(rule.id, 'INACTIVE');
    expect(audit.actions()).toEqual(['RULE_DEACTIVATED']);
  });
});
