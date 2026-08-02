import { RuleApplierService } from '../../src/modules/rules/application/services/rule-applier.service';

describe('RuleApplierService', () => {
  it('returns records unchanged for placeholder implementation', () => {
    const svc = new RuleApplierService();
    const records = [{ id: 1 }];
    const result = svc.applyRules(records, [{ id: 'rule-1' }]);
    expect(result).toEqual(records);
  });
});
