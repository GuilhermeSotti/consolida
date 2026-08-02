import { PrismaReportsRepository } from '../../src/modules/reports/infrastructure/persistence/prisma-reports.repository';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

describe('PrismaReportsRepository', () => {
  it('returns paginated reports', async () => {
    const mockPrisma: any = {
      report: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'report-1',
            name: 'Report 1',
            description: 'Desc',
            type: 'consolidated',
            status: 'COMPLETED',
            data: { records: [] },
            createdBy: 'user1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };

    const repo = new PrismaReportsRepository(mockPrisma as PrismaService);
    const result = await repo.findAll({ page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe('Report 1');
  });
});
