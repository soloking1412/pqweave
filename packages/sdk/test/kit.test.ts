import { describe, expect, it } from 'vitest';
import { planMigration } from '../src/kit/index.js';

describe('migration kit route selection', () => {
  const address = 'example-public-address';

  it('keeps EVM execution on testnet and calls out the 7702 override', () => {
    const plan = planMigration({ chain: 'base', address, exposure: 'exposed' });
    expect(plan.outcome).toBe('protected');
    expect(plan.availability).toBe('testnet');
    expect(plan.limitations.join(' ')).toContain('ECDSA');
  });

  it('does not treat arbitrary contract code as a verified PQ account', () => {
    const plan = planMigration({
      chain: 'ethereum',
      address,
      exposure: 'unknown',
      isContract: true,
    });
    expect(plan.outcome).toBe('prepared');
  });

  it('routes Algorand to native rekeying without assuming its signer from an address', () => {
    const plan = planMigration({
      chain: 'algorand',
      address,
      exposure: 'unknown',
      currentAuthority: 'rekeyed-unknown',
    });
    expect(plan.availability).toBe('native');
    expect(plan.checks.join(' ')).toContain('authorized address');
  });

  it('keeps Bitcoin watch-only and blocks a mainnet PQ claim', () => {
    const plan = planMigration({ chain: 'bitcoin', address, exposure: 'exposed' });
    expect(plan.outcome).toBe('transitional');
    expect(plan.availability).toBe('watch-only');
    expect(plan.limitations.join(' ')).toContain('drafts');
  });

  it('reports a custody change for Solana rather than wallet migration', () => {
    expect(planMigration({ chain: 'solana', address, exposure: 'exposed' }).outcome).toBe(
      'custody-change',
    );
  });
});
