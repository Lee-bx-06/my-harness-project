import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Encryption } from './encryption';

const FILE_ENCODING = 'utf8';
const CREDENTIAL_FILE_MODE = 0o600;

export type KeyringAdapter = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

export type CredentialManagerOptions = {
  keyring: KeyringAdapter;
  masterPassphrase: string;
  serviceName: string;
  storagePath: string;
  encryption?: Encryption;
};

type CredentialStore = Record<string, string>;

export class CredentialManager {
  private readonly encryption: Encryption;
  private readonly keyring: KeyringAdapter;
  private readonly masterPassphrase: string;
  private readonly serviceName: string;
  private readonly storagePath: string;

  constructor(options: CredentialManagerOptions) {
    assertString(options.masterPassphrase, 'masterPassphrase');
    assertString(options.serviceName, 'serviceName');
    assertString(options.storagePath, 'storagePath');

    this.encryption = options.encryption ?? new Encryption();
    this.keyring = options.keyring;
    this.masterPassphrase = options.masterPassphrase;
    this.serviceName = options.serviceName;
    this.storagePath = options.storagePath;
  }

  async get(name: string): Promise<string | null> {
    assertCredentialName(name);

    const keyringValue = await this.tryGetFromKeyring(name);

    if (keyringValue !== null) {
      return keyringValue;
    }

    return await this.getFromFile(name);
  }

  async set(name: string, value: string): Promise<void> {
    assertCredentialName(name);
    assertString(value, 'value');

    if (!await this.trySetInKeyring(name, value)) {
      await this.setInFile(name, value);
    }
  }

  async update(name: string, value: string): Promise<void> {
    await this.set(name, value);
  }

  async clear(name: string): Promise<void> {
    assertCredentialName(name);

    await this.tryDeleteFromKeyring(name);
    await this.deleteFromFile(name);
  }

  private async tryGetFromKeyring(name: string): Promise<string | null> {
    try {
      return await this.keyring.getPassword(this.serviceName, name);
    } catch {
      return null;
    }
  }

  private async trySetInKeyring(name: string, value: string): Promise<boolean> {
    try {
      await this.keyring.setPassword(this.serviceName, name, value);
      return true;
    } catch {
      return false;
    }
  }

  private async tryDeleteFromKeyring(name: string): Promise<void> {
    try {
      await this.keyring.deletePassword(this.serviceName, name);
    } catch {
      // Deleting the encrypted fallback still matters if the OS keyring is unavailable.
    }
  }

  private async deleteFromFile(name: string): Promise<void> {
    const credentials = await this.readFileStore();
    delete credentials[name];
    await this.writeFileStore(credentials);
  }

  private async getFromFile(name: string): Promise<string | null> {
    const credentials = await this.readFileStore();

    return credentials[name] ?? null;
  }

  private async setInFile(name: string, value: string): Promise<void> {
    const credentials = await this.readFileStore();
    credentials[name] = value;
    await this.writeFileStore(credentials);
  }

  private async readFileStore(): Promise<CredentialStore> {
    let encrypted: string;

    try {
      encrypted = await readFile(this.storagePath, FILE_ENCODING);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return {};
      }

      throw error;
    }

    const decrypted = await this.encryption.decrypt(encrypted, this.masterPassphrase);
    const parsed = JSON.parse(decrypted) as unknown;

    if (!isCredentialStore(parsed)) {
      throw new Error('Invalid credential store.');
    }

    return parsed;
  }

  private async writeFileStore(credentials: CredentialStore): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });

    const encrypted = await this.encryptStore(credentials);

    await writeFile(this.storagePath, encrypted, {
      encoding: FILE_ENCODING,
      mode: CREDENTIAL_FILE_MODE,
    });
  }

  private async encryptStore(credentials: CredentialStore): Promise<string> {
    return await this.encryption.encrypt(
      JSON.stringify(credentials),
      this.masterPassphrase,
    );
  }
}

function isCredentialStore(value: unknown): value is CredentialStore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function assertCredentialName(value: unknown): asserts value is string {
  assertString(value, 'name');

  if (value.trim() === '') {
    throw new TypeError('name must not be blank.');
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`${name} must be a string.`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
