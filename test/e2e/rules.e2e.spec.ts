import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Rules (E2E)', () => {
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

  describe('/api/v1/rules (POST)', () => {
    it('should create a rule', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/rules')
        .send({
          name: 'Regra de integração',
          description: 'Teste E2E',
          status: 'ACTIVE',
        })
        .expect(201);
    });

    it('should reject invalid rule data', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/rules')
        .send({
          name: '',
          description: '',
        })
        .expect(400);
    });
  });

  describe('/api/v1/rules (GET)', () => {
    it('should return list of rules', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rules')
        .expect(200);
    });
  });

  describe('/api/v1/rules/:id (GET)', () => {
    it('should return a single rule', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rules/1')
        .expect(200);
    });
  });

  describe('/api/v1/rules/:id (PUT)', () => {
    it('should update a rule', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/rules/1')
        .send({
          name: 'Regra atualizada',
          status: 'INACTIVE',
        })
        .expect(200);
    });
  });

  describe('/api/v1/rules/:id (DELETE)', () => {
    it('should delete a rule', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/rules/1')
        .expect(200);
    });
  });
});
