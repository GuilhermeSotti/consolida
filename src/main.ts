import './infrastructure/observability/tracing';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { StructuredLoggerService } from './observability/structured-logger.service';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Setup structured logger
  const logger = app.get(StructuredLoggerService);
  app.useLogger(logger);

  app.setGlobalPrefix('api/v1');

  // Trust proxy for correct client IP in rate limiting
  const server = app.getHttpServer();
  server.set('trust proxy', 1);

  // Apply Helmet for security headers
  app.use(helmet());

  // Configure CORS for allowed origins
  app.enableCors({
    origin: [
      process.env.CORS_ORIGIN_1 || 'http://localhost:3001',
      process.env.CORS_ORIGIN_2 || 'http://localhost:3002',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    app.get(RequestLoggingInterceptor),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ConsolidaHub API')
    .setDescription(
      'Motor de Regras e Relatório Consolidado - Plataforma Profissional de Automação',
    )
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT Bearer token',
    })
    .addServer('http://localhost:3000', 'Desenvolvimento Local')
    .addServer('https://hml-api.consolidahub.com/api/v1', 'Homologação')
    .addServer('https://api.consolidahub.com/api/v1', 'Produção')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`ConsolidaHub API is running at http://localhost:${port}`, 'Bootstrap');
  logger.log(`Swagger docs available at http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
