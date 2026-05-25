import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsObject,
  IsNumber,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';
import { RuleStatus } from '../../domain/enums/rule-status.enum';

export class CreateRuleDto {
  @ApiProperty({
    example: 'Regra de Aprovação de Cadastro',
    description: 'Nome descritivo da regra',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 'Valida se o cadastro contém todos os campos obrigatórios.',
    description: 'Descrição detalhada da regra',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    description: 'IDs das fontes de dados associadas',
  })
  @IsArray()
  @IsNotEmpty()
  sourceIds: string[];

  @ApiProperty({
    type: Object,
    example: {
      type: 'AND',
      conditions: [
        { field: 'status', operator: 'eq', value: 'PENDING' },
      ],
    },
    description: 'Condições da regra em formato JSON',
  })
  @IsObject()
  @IsNotEmpty()
  conditions: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    example: {
      type: 'UPDATE_STATUS',
      payload: { status: 'APPROVED' },
    },
    description: 'Ações a executar quando condições forem atendidas',
  })
  @IsObject()
  @IsNotEmpty()
  actions: Record<string, unknown>;

  @ApiProperty({
    example: 0,
    description: 'Prioridade da regra',
    minimum: 0,
    default: 0,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  priority?: number = 0;

  @ApiProperty({
    enum: RuleStatus,
    example: RuleStatus.ACTIVE,
    description: 'Status inicial da regra',
    default: RuleStatus.ACTIVE,
    required: false,
  })
  @IsEnum(RuleStatus)
  @IsOptional()
  status?: RuleStatus = RuleStatus.ACTIVE;
}
