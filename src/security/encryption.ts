import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import * as argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const KDF = 'argon2id';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

type EncryptedPayload = {
  version: 1;
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
      version: 1,
      algorithm: ALGORITHM,
      kdf: KDF,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };

    return JSON.stringify(payload);
  }

  async decrypt(encrypted: string, passphrase: string): Promise<string> {
    assertString(encrypted, 'encrypted');
    assertString(passphrase, 'passphrase');

    const payload = parsePayload(encrypted);
    const key = await this.deriveKey(passphrase, Buffer.from(payload.salt, 'base64'));
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));

    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  async deriveKey(passphrase: string, salt: string | Buffer): Promise<Buffer> {
    assertString(passphrase, 'passphrase');

    const saltBuffer = normalizeSalt(salt);

    return await argon2.hash(passphrase, {
      type: argon2.argon2id,
      salt: saltBuffer,
      hashLength: KEY_LENGTH,
      raw: true,
    });
  }
}

function normalizeSalt(salt: string | Buffer): Buffer {
  const saltBuffer = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'utf8');

  if (saltBuffer.length >= 8) {
    return saltBuffer;
  }

  return createHash('sha256').update(saltBuffer).digest().subarray(0, SALT_LENGTH);
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
    payload.version === 1 &&
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
