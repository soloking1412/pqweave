import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa';
import { slh_dsa_sha2_192f } from '@noble/post-quantum/slh-dsa';

/** Minimal structural type matching the @noble/post-quantum signer surface we use. */
export interface NobleSigner {
  signRandBytes: number;
  keygen: (seed: Uint8Array) => { secretKey: Uint8Array; publicKey: Uint8Array };
  sign: (secretKey: Uint8Array, msg: Uint8Array, random?: Uint8Array) => Uint8Array;
  verify: (publicKey: Uint8Array, msg: Uint8Array, sig: Uint8Array) => boolean;
}

export type PqcSchemeId = 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87' | 'slh-dsa-sha2-192f';

export type PqcFamily = 'ml-dsa' | 'slh-dsa';

export interface PqcSchemeInfo {
  id: PqcSchemeId;
  label: string;
  /** NIST standard the scheme is drawn from. */
  standard: string;
  family: PqcFamily;
  /** NIST security category. */
  securityCategory: 2 | 3 | 5;
  /** Byte length of the seed consumed by keygen. */
  seedLength: number;
  signer: NobleSigner;
}

export const PQC_SCHEMES: Record<PqcSchemeId, PqcSchemeInfo> = {
  'ml-dsa-44': {
    id: 'ml-dsa-44',
    label: 'ML-DSA-44 (Dilithium2)',
    standard: 'FIPS 204',
    family: 'ml-dsa',
    securityCategory: 2,
    seedLength: 32,
    signer: ml_dsa44,
  },
  'ml-dsa-65': {
    id: 'ml-dsa-65',
    label: 'ML-DSA-65 (Dilithium3)',
    standard: 'FIPS 204',
    family: 'ml-dsa',
    securityCategory: 3,
    seedLength: 32,
    signer: ml_dsa65,
  },
  'ml-dsa-87': {
    id: 'ml-dsa-87',
    label: 'ML-DSA-87 (Dilithium5)',
    standard: 'FIPS 204',
    family: 'ml-dsa',
    securityCategory: 5,
    seedLength: 32,
    signer: ml_dsa87,
  },
  'slh-dsa-sha2-192f': {
    id: 'slh-dsa-sha2-192f',
    label: 'SLH-DSA-SHA2-192f (SPHINCS+)',
    standard: 'FIPS 205',
    family: 'slh-dsa',
    securityCategory: 3,
    seedLength: 72,
    signer: slh_dsa_sha2_192f,
  },
};

/**
 * NIST-primary signature standard. Selected as the default because it is the
 * scheme the broader ecosystem is standardizing on and it has a working
 * on-chain verifier (ETHDILITHIUM).
 */
export const DEFAULT_PQC_SCHEME: PqcSchemeId = 'ml-dsa-65';

/** Most conservative scheme (hash-based); used for high-assurance recovery keys. */
export const RECOVERY_PQC_SCHEME: PqcSchemeId = 'slh-dsa-sha2-192f';

export function schemeInfo(id: PqcSchemeId): PqcSchemeInfo {
  const info = PQC_SCHEMES[id];
  if (!info) throw new Error(`Unknown PQC scheme: ${id}`);
  return info;
}
