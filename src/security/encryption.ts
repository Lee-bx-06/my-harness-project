import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import * as argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const KDF = 'argon2id';
const PAYLOAD_VERSION = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const MIN_ARGON2_SALT_LENGTH = 8;

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  hashLength: KEY_LENGTH,
  raw: true,
} as const;

type EncryptedPayload = {
  version: typeof PAYLOAD_VERSION;
  algorithm: typeof ALGORITHM;
  kdf: typeof KDF;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

export class Encryption {
  async encrypt(plaintext: string, passphrase: string): Promise<string> {
    assertString(plaintext, 'plaintext');
    assertString(passphrase, 'passphrase');

    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = await this.deriveKey(passphrase, salt);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const payload: EncryptedPayload = {
      version: PAYLOAD_VERSION,
      algorithm: ALGORITHM,
      kdf: KDF,
      salt: toBase64(salt),
      iv: toBase64(iv),
      authTag: toBase64(cipher.getAuthTag()),
      ciphertext: toBase64(ciphertext),
    };

    return JSON.stringify(payload);
  }

  async decrypt(encrypted: string, passphrase: string): Promise<string> {
    assertString(encrypted, 'encrypted');
    assertString(passphrase, 'passphrase');

    const payload = parsePayload(encrypted);
    const key = await this.deriveKey(passphrase, fromBase64(payload.salt));
    const decipher = createDecipheriv(ALGORITHM, key, fromBase64(payload.iv));

    decipher.setAuthTag(fromBase64(payload.authTag));

    const plaintext = Buffer.concat([
      decipher.update(fromBase64(payload.ciphertext)),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  async deriveKey(passphrase: string, salt: string | Buffer): Promise<Buffer> {
    assertString(passphrase, 'passphrase');

    const saltBuffer = normalizeSalt(salt);

    return await argon2.hash(passphrase, {
      salt: saltBuffer,
      ...ARGON2_OPTIONS,
    });
  }
}

function normalizeSalt(salt: string | Buffer): Buffer {
  const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'utf8');

  if (saltBuffer.length >= MIN_ARGON2_SALT_LENGTH) {
    return saltBuffer;
  }

  return createHash('sha256').update(saltBuffer).digest().subarray(0, SALT_LENGTH);
}

function toBase64(value: Buffer): string {
  return value.toString('base64');
}

function fromBase64(value: string): Buffer {
  return Buffer.from(value, 'base64');
}

function parsePayload(value: string): EncryptedPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid encrypted payload.');
  }

  if (!isEncryptedPayload(parsed)) {
    throw new Error('Invalid encrypted payload.');
  }

  return parsed;
}

function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    payload.version === PAYLOAD_VERSION &&
    payload.algorithm === ALGORITHM &&
    payload.kdf === KDF &&
    typeof payload.salt === 'string' &&
    typeof payload.iv === 'string' &&
    typeof payload.authTag === 'string' &&
    typeof payload.ciphertext === 'string'
  );
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string.`);
  }
}
