import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CredentialManager } from '../../../src/security/credential';

type KeyringLike = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

class MemoryKeyring implements KeyringLike {
  readonly values = new Map<string, string>();

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.values.get(key(service, account)) ?? null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.values.set(key(service, account), password);
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(key(service, account));
  }
}

class UnavailableKeyring implements KeyringLike {
  async getPassword(): Promise<string | null> {
    throw new Error('keyring unavailable');
  }

  async setPassword(): Promise<void> {
    throw new Error('keyring unavailable');
  }

  async deletePassword(): Promise<boolean> {
    throw new Error('keyring unavailable');
  }
}

async function withTempCredentialFile<T>(run: (storagePath: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'credential-manager-'));

  try {
    return await run(path.join(rootDir, 'credentials.enc'));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function key(service: string, account: string): string {
  return `${service}:${account}`;
}

test('CredentialManager stores and reads credentials from the keyring first', async () => {
  await withTempCredentialFile(async (storagePath) => {
    const keyring = new MemoryKeyring();
    const manager = new CredentialManager({
      keyring,
      masterPassphrase: 'test-passphrase',
      serviceName: 'agent-harness-test',
      storagePath,
    });

    await manager.set('openai.apiKey', 'sk-test-key');

    assert.equal(await manager.get('openai.apiKey'), 'sk-test-key');
    assert.equal(keyring.values.get('agent-harness-test:openai.apiKey'), 'sk-test-key');
  });
});

test('CredentialManager updates and clears credentials', async () => {
  await withTempCredentialFile(async (storagePath) => {
    const manager = new CredentialManager({
      keyring: new MemoryKeyring(),
      masterPassphrase: 'test-passphrase',
      serviceName: 'agent-harness-test',
      storagePath,
    });

    await manager.set('openai.apiKey', 'old-key');
    await manager.update('openai.apiKey', 'new-key');

    assert.equal(await manager.get('openai.apiKey'), 'new-key');

    await manager.clear('openai.apiKey');

    assert.equal(await manager.get('openai.apiKey'), null);
  });
});

test('CredentialManager falls back to encrypted file storage when keyring is unavailable', async () => {
  await withTempCredentialFile(async (storagePath) => {
    const manager = new CredentialManager({
      keyring: new UnavailableKeyring(),
      masterPassphrase: 'test-passphrase',
      serviceName: 'agent-harness-test',
      storagePath,
    });

    await manager.set('openai.apiKey', 'sk-file-key');

    assert.equal(await manager.get('openai.apiKey'), 'sk-file-key');

    const encryptedFile = await readFile(storagePath, 'utf8');
    assert.doesNotMatch(encryptedFile, /sk-file-key/);
    assert.match(encryptedFile, /argon2id/);
  });
});
