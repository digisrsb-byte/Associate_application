import { afterEach, describe, expect, it, vi } from 'vitest';

describe('db pool', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('getPoolTargetSummary redacts DATABASE_URL', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://user:secret@localhost:5432/associate'
    );
    const { getPoolTargetSummary } = await import('../../src/db/pool.ts');
    const summary = getPoolTargetSummary();
    expect(summary).not.toContain('secret');
    expect(summary.toLowerCase()).toMatch(/postgres|localhost|associate/);
  });

  it('getPool throws when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getPool } = await import('../../src/db/pool.ts');
    expect(() => getPool()).toThrow(/DATABASE_URL is missing/);
  });

  it('closePool is safe when pool was never opened', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { closePool } = await import('../../src/db/pool.ts');
    await expect(closePool()).resolves.toBeUndefined();
  });
});
