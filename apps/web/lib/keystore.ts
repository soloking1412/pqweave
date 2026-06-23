import { bytesToHex, type Hex, hexToBytes } from 'viem';

/**
 * Encrypted recovery file for a post-quantum key seed. The 32-byte seed is
 * encrypted with AES-256-GCM under a key derived from the user's password via
 * PBKDF2. The plaintext seed never leaves this function. The public key root is
 * stored alongside (it is not secret) for convenient re-import.
 */
export interface EncryptedKeystore {
  version: 1;
  kdf: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  salt: Hex;
  cipher: 'AES-GCM';
  iv: Hex;
  ciphertext: Hex;
  publicKeyRoot: Hex;
  createdAt: string;
}

const PBKDF2_ITERATIONS = 600_000;

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
): Promise<EncryptedKeystore> {
  const salt = toBuffer(crypto.getRandomValues(new Uint8Array(16)));
  const iv = toBuffer(crypto.getRandomValues(new Uint8Array(12)));
  const key = await deriveAesKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, toBuffer(seed)),
  );

  return {
    version: 1,
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    cipher: 'AES-GCM',
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ciphertext),
    publicKeyRoot,
    createdAt: new Date().toISOString(),
  };
}

/** Recover the seed from an encrypted keystore. Throws on a wrong password. */
export async function decryptSeed(keystore: EncryptedKeystore, password: string): Promise<Hex> {
  const key = await deriveAesKey(password, toBuffer(keystore.salt), keystore.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(keystore.iv) },
    key,
    toBuffer(keystore.ciphertext),
  );
  return bytesToHex(new Uint8Array(plaintext));
}
