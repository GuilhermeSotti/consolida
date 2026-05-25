import {
  IsOptional,
  IsString,
  IsNumberString,
  IsIn,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class QueryRulesDto {
  @ApiProperty({
    description: 'Número da página',
    example: '1',
    required: false,
  })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiProperty({
    description: 'Quantidade de itens por página',
    example: '20',
    required: false,
  })
  @IsOptional()
  @IsNumberString()
  pageSize?: string;

  @ApiProperty({
    description: 'Filtrar por status',
    enum: ['ACTIVE', 'INACTIVE'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;

  @ApiProperty({
    description: 'Buscar por nome ou descrição',
    example: 'Aprovação',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    description: 'Campo para ordenação',
    enum: ['name', 'createdAt', 'version'],
    default: 'createdAt',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'createdAt', 'version'])
  sortBy?: string = 'createdAt';

  @ApiProperty({
    description: 'Ordem de classificação',
    enum: ['asc', 'desc'],
    default: 'desc',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
