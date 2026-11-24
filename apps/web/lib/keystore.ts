import { bytesToHex, type Hex, hexToBytes } from 'viem';

/**
 * Encrypted recovery file for a post-quantum key seed. The 32-byte seed is
 * encrypted with AES-256-GCM under a key derived from the user's password via
 * PBKDF2. The seed is returned only after decryption. Public metadata in version 3 is
 * authenticated with the ciphertext. This file does not contain a signing journal.
 */
export interface EncryptedKeystore {
  version: 1 | 2 | 3;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: Hex;
  cipher: 'AES-GCM';
  iv: Hex;
  ciphertext: Hex;
  publicKeyRoot: Hex;
  /** One-time-key tree size (v2+). Needed to restore a signer from the seed. */
  treeSize?: number;
  createdAt: string;
}

const PBKDF2_ITERATIONS = 600_000;

function validate(file: EncryptedKeystore): void {
  if (
    !file ||
    ![1, 2, 3].includes(file.version) ||
    file.kdf !== 'PBKDF2' ||
    file.hash !== 'SHA-256' ||
    file.cipher !== 'AES-GCM' ||
    !Number.isInteger(file.iterations) ||
    file.iterations < 100_000 ||
    file.iterations > 1_000_000 ||
    !/^0x[0-9a-fA-F]{32}$/.test(file.salt) ||
    !/^0x[0-9a-fA-F]{24}$/.test(file.iv) ||
    !/^0x[0-9a-fA-F]{96}$/.test(file.ciphertext) ||
    !/^0x[0-9a-fA-F]{64}$/.test(file.publicKeyRoot) ||
    typeof file.createdAt !== 'string' ||
    file.createdAt.length > 40 ||
    !Number.isFinite(Date.parse(file.createdAt)) ||
    (file.treeSize !== undefined &&
      (!Number.isInteger(file.treeSize) ||
        file.treeSize < 1 ||
        file.treeSize > 4096 ||
        (file.treeSize & (file.treeSize - 1)) !== 0))
  ) {
    throw new Error('Invalid or unsupported recovery file');
  }
}

function metadata(file: EncryptedKeystore): Uint8Array<ArrayBuffer> {
  return toBuffer(
    new TextEncoder().encode(
      JSON.stringify([
        file.version,
        file.kdf,
        file.hash,
        file.iterations,
        file.salt,
        file.cipher,
        file.iv,
        file.publicKeyRoot,
        file.treeSize ?? null,
        file.createdAt,
      ]),
    ),
  );
}

/** Copy bytes into a fresh ArrayBuffer-backed view, as Web Crypto requires. */
function toBuffer(input: Uint8Array | Hex): Uint8Array<ArrayBuffer> {
  const view = typeof input === 'string' ? hexToBytes(input) : input;
  const out = new Uint8Array(view.length);
  out.set(view);
  return out;
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSeed(
  seed: Hex,
  password: string,
  publicKeyRoot: Hex,
  treeSize?: number,
): Promise<EncryptedKeystore> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(seed)) throw new Error('Expected a 32-byte seed');
  if (password.length < 8 || password.length > 1024)
    throw new Error('Password must be 8–1024 characters');
  const file: EncryptedKeystore = {
    version: 3,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
    cipher: 'AES-GCM',
    iv: bytesToHex(crypto.getRandomValues(new Uint8Array(12))),
    ciphertext: `0x${'00'.repeat(48)}`,
    publicKeyRoot,
    ...(treeSize !== undefined ? { treeSize } : {}),
    createdAt: new Date().toISOString(),
  };
  validate(file);
  const key = await deriveAesKey(password, toBuffer(file.salt), file.iterations);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(file.iv), additionalData: metadata(file) },
    key,
    toBuffer(seed),
  );
  file.ciphertext = bytesToHex(new Uint8Array(ciphertext));
  return file;
}

/** Recover the seed from an encrypted keystore. Throws on a wrong password. */
export async function decryptSeed(keystore: EncryptedKeystore, password: string): Promise<Hex> {
  validate(keystore);
  if (password.length > 1024) throw new Error('Password too long');
  const key = await deriveAesKey(password, toBuffer(keystore.salt), keystore.iterations);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBuffer(keystore.iv),
      ...(keystore.version === 3 ? { additionalData: metadata(keystore) } : {}),
    },
    key,
    toBuffer(keystore.ciphertext),
  );
  return bytesToHex(new Uint8Array(plaintext));
}
