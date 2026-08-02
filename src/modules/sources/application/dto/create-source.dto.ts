import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateSourceDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
