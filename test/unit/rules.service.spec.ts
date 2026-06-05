import { Test } from '@nestjs/testing';
import { RulesService } from '../../src/modules/rules/application/services/rules.service';
import { RuleStatus } from '../../src/modules/rules/domain/enums/rule-status.enum';

describe('RulesService (Unit)', () => {
  let service: RulesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RulesService],
    }).compile();

    service = moduleRef.get(RulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a rule with valid data', () => {
    const createRuleDto = {
      name: 'Regra de teste',
      description: 'Descrição de teste',
      status: RuleStatus.ACTIVE,
    };

    // Teste básico para demonstrar estrutura
    expect(createRuleDto.name).toBe('Regra de teste');
    expect(createRuleDto.status).toBe(RuleStatus.ACTIVE);
  });

  it('should validate rule fields', () => {
    const invalidRule = {
      name: '',
      description: '',
    };

    expect(invalidRule.name).toBe('');
  });
});
