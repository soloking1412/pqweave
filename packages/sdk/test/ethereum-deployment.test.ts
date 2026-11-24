import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeploymentStatus, isExecutionNetwork } from '../../../apps/web/lib/deployment.js';

afterEach(() => vi.unstubAllEnvs());
function configure() {
  for (const role of ['FACTORY', 'VERIFIER', 'BATCH_EXECUTOR']) {
    vi.stubEnv(`NEXT_PUBLIC_${role}_ADDRESS`, `0x${'11'.repeat(20)}`);
  }
  for (const role of ['FACTORY', 'VERIFIER', 'BATCH_EXECUTOR', 'ACCOUNT', 'ENTRYPOINT']) {
    vi.stubEnv(`NEXT_PUBLIC_${role}_CODE_HASH`, `0x${'22'.repeat(32)}`);
  }
  vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_STAGE', 'testnet');
  vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_CHAIN_ID', '11155111');
}
describe('Ethereum execution release gate', () => {
  it('binds the configured prototype to Sepolia and requires runtime hashes', () => {
    configure();
    expect(getDeploymentStatus().live).toBe(true);
    expect(isExecutionNetwork('testnet', 11155111)).toBe(true);
    expect(isExecutionNetwork('testnet', 84532)).toBe(false);
    expect(isExecutionNetwork('testnet', 1)).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_FACTORY_CODE_HASH', '');
    expect(getDeploymentStatus().live).toBe(false);
  });
  it('does not enable mainnet through an environment approval flag', () => {
    configure();
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_STAGE', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_CHAIN_ID', '1');
    vi.stubEnv('NEXT_PUBLIC_AUDIT_APPROVED', 'true');
    expect(getDeploymentStatus().live).toBe(false);
    expect(isExecutionNetwork('mainnet', 1)).toBe(false);
  });
});
