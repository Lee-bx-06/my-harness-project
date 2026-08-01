import { randomUUID } from 'node:crypto';
import sqlite3 from 'sqlite3';

export type MemoryType = 'session' | 'project' | 'long-term';

export interface MemoryInput {
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface MemoryStoreOptions {
  databasePath: string;
}

interface MemoryRow {
  id: string;
  type: MemoryType;
  content: string;
  metadata: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

const SELECT_MEMORY_COLUMNS = 'id, type, content, metadata, created_at, updated_at, expires_at';

export class MemoryStore {
  private db?: sqlite3.Database;

  constructor(private readonly options: MemoryStoreOptions) {}

  async initialize(): Promise<void> {
    this.db = await openDatabase(this.options.databasePath);
    await createSchema(this.database);
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.db = undefined;
    await closeDatabase(db);
  }

  async save(memory: MemoryInput): Promise<MemoryRecord> {
    const record = createRecord(memory);

    await run(
      this.database,
      `
        INSERT INTO memories (id, type, content, metadata, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      serializeRecord(record),
    );

    return record;
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    const row = await get<MemoryRow>(
      this.database,
      `
        SELECT ${SELECT_MEMORY_COLUMNS}
        FROM memories
        WHERE id = ?
      `,
      [id],
    );

    return row ? deserializeRow(row) : undefined;
  }

  async list(filter: { type?: MemoryType } = {}): Promise<MemoryRecord[]> {
    const rows = await all<MemoryRow>(
      this.database,
      listQuery(filter),
      filter.type ? [filter.type] : [],
    );

    return rows.map(deserializeRow);
  }

  async update(
    id: string,
    patch: Partial<Pick<MemoryInput, 'content' | 'metadata'>>,
  ): Promise<MemoryRecord> {
    const existing = await this.requireMemory(id);
    const updated = updateRecord(existing, patch);

    await run(
      this.database,
      `
        UPDATE memories
        SET content = ?, metadata = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        updated.content,
        JSON.stringify(updated.metadata),
        updated.updatedAt.toISOString(),
        updated.id,
      ],
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const result = await run(this.database, 'DELETE FROM memories WHERE id = ?', [id]);
    return result.changes > 0;
  }

  async clearExpired(now: Date = new Date()): Promise<number> {
    const result = await run(
      this.database,
      'DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?',
      [now.toISOString()],
    );
    return result.changes;
  }

  private async requireMemory(id: string): Promise<MemoryRecord> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Memory "${id}" was not found.`);
    }

    return existing;
  }

  private get database(): sqlite3.Database {
    if (!this.db) {
      throw new Error('MemoryStore has not been initialized.');
    }

    return this.db;
  }
}

async function createSchema(db: sqlite3.Database): Promise<void> {
  await run(db, `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT
      )
    `);
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)');
  await run(db, 'CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at)');
}

function serializeRecord(record: MemoryRecord): unknown[] {
  return [
    record.id,
    record.type,
    record.content,
    JSON.stringify(record.metadata),
    record.createdAt.toISOString(),
    record.updatedAt.toISOString(),
    record.expiresAt?.toISOString() ?? null,
  ];
}

function createRecord(memory: MemoryInput): MemoryRecord {
  const now = new Date();

  return {
    id: randomUUID(),
    type: memory.type,
    content: memory.content,
    metadata: memory.metadata ?? {},
    createdAt: now,
    updatedAt: now,
    expiresAt: memory.expiresAt,
  };
}

function updateRecord(
  record: MemoryRecord,
  patch: Partial<Pick<MemoryInput, 'content' | 'metadata'>>,
): MemoryRecord {
  return {
    ...record,
    content: patch.content ?? record.content,
    metadata: patch.metadata ?? record.metadata,
    updatedAt: new Date(),
  };
}

function deserializeRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
  };
}

function listQuery(filter: { type?: MemoryType }): string {
  if (filter.type) {
    return `
      SELECT ${SELECT_MEMORY_COLUMNS}
      FROM memories
      WHERE type = ?
      ORDER BY created_at ASC
    `;
  }

  return `
    SELECT ${SELECT_MEMORY_COLUMNS}
    FROM memories
    ORDER BY created_at ASC
  `;
}

function openDatabase(databasePath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(databasePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function run(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = [],
): Promise<{ changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ changes: this.changes });
    });
  });
}

function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row: T | undefined) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows: T[]) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}
