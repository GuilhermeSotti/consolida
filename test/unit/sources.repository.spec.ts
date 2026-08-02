import { PrismaSourcesRepository } from '../../src/modules/sources/infrastructure/persistence/prisma-sources.repository';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

describe('PrismaSourcesRepository', () => {
  it('maps source entity from prisma result', async () => {
    const mockPrisma: any = {
      source: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'source-1',
          name: 'Sample',
          type: 'excel',
          status: 'ACTIVE',
          config: { filePath: 'path' },
          createdBy: 'user1',
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const repo = new PrismaSourcesRepository(mockPrisma as PrismaService);
    const source = await repo.findById('source-1');

    expect(source).not.toBeNull();
    expect(source?.name).toBe('Sample');
    expect(source?.config).toEqual({ filePath: 'path' });
  });
});
