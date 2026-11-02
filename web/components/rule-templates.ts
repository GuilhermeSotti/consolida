import type { RuleType } from '@/lib/types';

/** Starting points for the definition editor (validated by the API, which canonicalizes columns). */
export const RULE_TEMPLATES: Record<RuleType, { label: string; template: unknown }> = {
  FILTER: {
    label: 'Filtro (Constante)',
    template: { condition: { column: 'STATUS', operator: 'EQUALS', values: ['OK'], normalization: ['TRIM', 'UPPERCASE'], compareAs: 'TEXT' } },
  },
  CONDITIONAL_ASSIGNMENT: {
    label: 'Atribuição condicional (Causante)',
    template: {
      condition: { column: 'TIPO', operator: 'EQUALS', values: ['DEVOLUCAO'] },
      targetColumn: 'SITUACAO',
      value: { kind: 'LITERAL', value: 'REVISAR' },
    },
  },
  ARITHMETIC: {
    label: 'Cálculo (Aritmética)',
    template: { operands: ['VALOR_BRUTO', 'IMPOSTO'], operations: ['SUBTRACT'], targetColumn: 'VALOR_LIQUIDO' },
  },
  STANDARDIZATION: {
    label: 'Padronização (Padronal)',
    template: { columns: ['CNPJ'], operation: { kind: 'CLEAN', removeSpecialCharacters: true } },
  },
  LOOKUP: {
    label: 'Cruzamento com base de referência (Matrix)',
    template: {
      keyColumns: ['FORNECEDOR'],
      referenceSourceIds: ['<id da fonte de referência>'],
      referenceKeyColumns: ['CODIGO'],
      columnsToBring: ['NOME'],
      matchMode: 'EXACT',
    },
  },
  PROJECTION: {
    label: 'Colunas finais / renomeadas',
    template: { columns: [{ source: 'NF', as: 'NOTA_FISCAL' }, { source: 'VALOR_LIQUIDO' }] },
  },
};
