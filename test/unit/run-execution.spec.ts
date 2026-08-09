import { RunExecutionUseCase } from '../../src/modules/executions/application/use-cases/run-execution.use-case';

describe('RunExecutionUseCase', () => {
  it('creates execution and report when configuration exists', async () => {
    const mockPrisma: any = {
      execution: { create: jest.fn().mockResolvedValue({ id: 'exec-1' }), update: jest.fn() },
      configuration: { findUnique: jest.fn().mockResolvedValue({ id: 'config-1', phases: [] }) },
      dataTable: { findMany: jest.fn().mockResolvedValue([]) },
      source: { findUnique: jest.fn().mockResolvedValue(null) },
      report: { create: jest.fn().mockResolvedValue({ id: 'report-1' }) },
      rule: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const svc = new RunExecutionUseCase(mockPrisma, { load: async () => [] } as any, { query: async () => [] } as any, { fetchFile: async () => Buffer.from('') } as any, { applyRules: async () => [] } as any);

    const res = await svc.execute({ configurationId: 'config-1', runBy: 'user-1' });

    expect(res.executionId).toBe('exec-1');
    expect(res.reportId).toBe('report-1');
  });
});
