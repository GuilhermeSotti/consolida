import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPort,
  IsString,
  IsUrl,
  validateSync,
} from 'class-validator';

enum Environment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  STAGING = 'staging',
}

class EnvironmentVariables {
  // ============ Server & Environment ============
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.DEVELOPMENT;

  @IsPort()
  @IsOptional()
  PORT: number = 3000;

  // ============ Database ============
  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  DATABASE_POOL_MIN?: string = '2';

  @IsOptional()
  @IsString()
  DATABASE_POOL_MAX?: string = '10';

  // ============ Redis (Cache & Sessions) ============
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  // ============ JWT & Security ============
  @IsString()
  JWT_SECRET: string;

  @IsNumber()
  @IsOptional()
  JWT_EXPIRATION: number = 3600; // 1 hour

  // ============ Entra ID (Azure AD) Configuration ============
  @IsString()
  ENTRA_TENANT_ID: string;

  @IsString()
  ENTRA_CLIENT_ID: string;

  @IsString()
  ENTRA_CLIENT_SECRET: string;

  @IsUrl()
  ENTRA_AUTHORITY: string; // e.g., https://login.microsoftonline.com/{tenantId}/v2.0

  @IsOptional()
  @IsString()
  ENTRA_REDIRECT_URI?: string;

  // ============ Logging & Observability ============
  @IsOptional()
  @IsString()
  LOG_LEVEL: string = 'info';

  @IsOptional()
  @IsUrl()
  LOG_SERVICE_URL?: string;

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  JAEGER_AGENT_HOST?: string = 'localhost';

  @IsOptional()
  @IsString()
  JAEGER_AGENT_PORT?: string = '6831';

  // ============ CORS ============
  @IsOptional()
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:3000';

  // ============ Storage (Cloud) ============
  @IsOptional()
  @IsString()
  STORAGE_TYPE?: string = 'local'; // 'local' | 'azure' | 's3'

  @IsOptional()
  @IsString()
  STORAGE_CONNECTION_STRING?: string;

  @IsOptional()
  @IsString()
  STORAGE_BUCKET?: string;

  @IsOptional()
  @IsString()
  STORAGE_REGION?: string;

  // ============ Secret Manager ============
  @IsOptional()
  @IsString()
  SECRET_MANAGER_TYPE?: string = 'env'; // 'env' | 'azure' | 'aws'

  @IsOptional()
  @IsString()
  AZURE_KEYVAULT_URL?: string;

  @IsOptional()
  @IsString()
  AWS_SECRETS_MANAGER_REGION?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
