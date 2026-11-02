import { ConflictError, ValidationError } from '../../../src/shared/domain/errors';
import {
  assertTransition,
  canTransition,
  isTerminal,
  parseInputSnapshot,
} from '../../../src/modules/executions/domain/execution';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('execution lifecycle', () => {
  it('allows only the documented transitions', () => {
    expect(canTransition('QUEUED', 'RUNNING')).toBe(true);
    expect(canTransition('RUNNING', 'SUCCEEDED')).toBe(true);
    expect(canTransition('RUNNING', 'QUEUED')).toBe(true);
    expect(canTransition('SUCCEEDED', 'RUNNING')).toBe(false);
    expect(canTransition('CANCELLED', 'QUEUED')).toBe(false);
    expect(() => assertTransition('FAILED', 'RUNNING')).toThrow(ConflictError);
  });

  it('identifies terminal states', () => {
    expect(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'].filter((s) => isTerminal(s as never))).toEqual([
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
    ]);
  });
});

describe('parseInputSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    const snapshot = {
      primaryImportId: ID(1),
      referenceImports: [{ sourceId: ID(2), importId: ID(3) }],
      rules: [{ ruleId: ID(4), ruleVersionId: ID(5), version: 2 }],
    };
    expect(parseInputSnapshot(snapshot)).toEqual(snapshot);
  });

  it.each([[null], [{}], [{ primaryImportId: ID(1), referenceImports: [{}], rules: [] }], [{ primaryImportId: 'x', referenceImports: [], rules: [] }]])(
    'rejects corrupted snapshot %#',
    (value) => {
      expect(() => parseInputSnapshot(value)).toThrow(ValidationError);
    },
  );
});
