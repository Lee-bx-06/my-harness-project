import assert from 'node:assert/strict';
import test from 'node:test';
import { Encryption } from '../../../src/security/encryption';

test('Encryption encrypts and decrypts a payload with the same passphrase', async () => {
  const encryption = new Encryption();
  const secret = 'api-key-secret';
  const passphrase = 'correct horse battery staple';

  const encrypted = await encryption.encrypt(secret, passphrase);

  assert.notStrictEqual(encrypted, secret);
  assert.equal(await encryption.decrypt(encrypted, passphrase), secret);
});

test('Encryption derives a stable key from the same passphrase and salt', async () => {
  const encryption = new Encryption();
  const passphrase = 'correct horse battery staple';

  const first = await encryption.deriveKey(passphrase, 'salt-a');
  const second = await encryption.deriveKey(passphrase, 'salt-a');
  const third = await encryption.deriveKey(passphrase, 'salt-b');

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, third);
});

test('Encryption records Argon2id as the key derivation function', async () => {
  const encryption = new Encryption();

  const encrypted = await encryption.encrypt('api-key-secret', 'correct horse battery staple');
  const payload = JSON.parse(encrypted) as Record<string, unknown>;

  assert.equal(payload.kdf, 'argon2id');
});
