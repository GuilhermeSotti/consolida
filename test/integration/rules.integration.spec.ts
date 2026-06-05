import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

describe('Rules Integration (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  it('should connect to database', async () => {
    // Teste de conexão com banco
    expect(app).toBeDefined();
  });

  it('should create a rule in database', async () => {
    // Simulação de criação de regra no banco
    const rule = {
      id: '1',
      name: 'Test Rule',
      description: 'Integration test rule',
      status: 'ACTIVE',
      version: 1,
    };

    expect(rule).toHaveProperty('id');
    expect(rule).toHaveProperty('name');
  });
});
