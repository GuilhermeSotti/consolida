import { redact, REDACTED } from '../../../src/shared/infrastructure/logging/redact';

describe('redact', () => {
  it('removes secrets, tokens and e-mails at any depth', () => {
    expect(
      redact({ authorization: 'Bearer x', nested: { accessToken: 't', clientSecret: 's', email: 'a@b.c', ok: 1 }, list: [{ password: 'p' }] }),
    ).toEqual({ authorization: REDACTED, nested: { accessToken: REDACTED, clientSecret: REDACTED, email: REDACTED, ok: 1 }, list: [{ password: REDACTED }] });
  });

  it('omits bulk payloads and bounds sizes', () => {
    const output = redact({ rows: [{ a: 1 }], content: Buffer.from('abc'), text: 'x'.repeat(3000), items: Array.from({ length: 60 }, (_, i) => i) }) as Record<string, unknown>;
    expect(output.rows).toBe('[OMITTED]');
    expect(output.content).toBe('[OMITTED]');
    expect((output.text as string).length).toBe(2001);
    expect((output.items as unknown[]).length).toBe(51);
  });

  it('serializes dates, bigints and errors safely', () => {
    expect(redact({ at: new Date('2026-10-23T00:00:00Z'), id: BigInt(7), error: new Error('falhou') })).toEqual({
      at: '2026-10-23T00:00:00.000Z',
      id: '7',
      error: { name: 'Error', message: 'falhou' },
    });
  });
});
