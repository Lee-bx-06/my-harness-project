import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryStore } from '../../../src/memory/store';

type MemoryType = 'session' | 'project' | 'long-term';

type MemoryInput = {
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
};

type MemoryRecord = {
  id: string;
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
};

type StoreLike = {
  initialize?: () => Promise<void>;
  close?: () => Promise<void>;
  save: (memory: MemoryInput) => Promise<MemoryRecord>;
  get: (id: string) => Promise<MemoryRecord | undefined>;
  list: (filter?: { type?: MemoryType }) => Promise<MemoryRecord[]>;
  update: (id: string, patch: Partial<Pick<MemoryInput, 'content' | 'metadata'>>) => Promise<MemoryRecord>;
  delete: (id: string) => Promise<boolean>;
  clearExpired: (now?: Date) => Promise<number>;
};

async function withTempStore<T>(run: (store: StoreLike, databasePath: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'memory-store-'));
  const databasePath = path.join(rootDir, 'memory.sqlite');
  const store = new MemoryStore({ databasePath }) as unknown as StoreLike;

  try {
    await store.initialize?.();
    return await run(store, databasePath);
  } finally {
    await store.close?.();
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function openStore(databasePath: string): Promise<StoreLike> {
  const store = new MemoryStore({ databasePath }) as unknown as StoreLike;
  await store.initialize?.();
  return store;
}

function assertMemory(record: MemoryRecord, expected: {
  type: MemoryType;
  content: string;
  metadata: Record<string, unknown>;
}): void {
  assert.equal(typeof record.id, 'string');
  assert.notEqual(record.id.trim(), '');
  assert.equal(record.type, expected.type);
  assert.equal(record.content, expected.content);
  assert.deepEqual(record.metadata, expected.metadata);
  assert.ok(record.createdAt instanceof Date);
  assert.ok(record.updatedAt instanceof Date);
}

test('MemoryStore saves and reads session, project, and long-term memories', async () => {
  await withTempStore(async (store) => {
    const session = await store.save({
      type: 'session',
      content: 'User asked to follow TDD.',
      metadata: { turn: 1 },
    });
    const project = await store.save({
      type: 'project',
      content: 'Feedback modules live under src/feedback.',
      metadata: { source: 'PLAN.md' },
    });
    const longTerm = await store.save({
      type: 'long-term',
      content: 'Prefer concise engineering updates.',
      metadata: { preference: true },
    });

    assertMemory((await store.get(session.id))!, {
      type: 'session',
      content: 'User asked to follow TDD.',
      metadata: { turn: 1 },
    });
    assertMemory((await store.get(project.id))!, {
      type: 'project',
      content: 'Feedback modules live under src/feedback.',
      metadata: { source: 'PLAN.md' },
    });
    assertMemory((await store.get(longTerm.id))!, {
      type: 'long-term',
      content: 'Prefer concise engineering updates.',
      metadata: { preference: true },
    });
  });
});

test('MemoryStore updates, deletes, and filters memories by type', async () => {
  await withTempStore(async (store) => {
    const session = await store.save({
      type: 'session',
      content: 'Original note.',
      metadata: { version: 1 },
    });
    await store.save({
      type: 'project',
      content: 'Project note.',
      metadata: {},
    });

    const updated = await store.update(session.id, {
      content: 'Updated note.',
      metadata: { version: 2 },
    });
    assertMemory(updated, {
      type: 'session',
      content: 'Updated note.',
      metadata: { version: 2 },
    });

    const sessions = await store.list({ type: 'session' });
    assert.deepEqual(sessions.map((memory) => memory.id), [session.id]);

    assert.equal(await store.delete(session.id), true);
    assert.equal(await store.get(session.id), undefined);
  });
});

test('MemoryStore persists memories across store instances', async () => {
  await withTempStore(async (store, databasePath) => {
    const saved = await store.save({
      type: 'project',
      content: 'Use node:test for unit tests.',
      metadata: { framework: 'node:test' },
    });

    await store.close?.();
    const reopened = await openStore(databasePath);

    try {
      assertMemory((await reopened.get(saved.id))!, {
        type: 'project',
        content: 'Use node:test for unit tests.',
        metadata: { framework: 'node:test' },
      });
    } finally {
      await reopened.close?.();
    }
  });
});

test('MemoryStore clears expired memories while preserving active entries', async () => {
  await withTempStore(async (store) => {
    const expired = await store.save({
      type: 'session',
      content: 'Old transient note.',
      metadata: {},
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const active = await store.save({
      type: 'session',
      content: 'Active transient note.',
      metadata: {},
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    });

    assert.equal(await store.clearExpired(new Date('2026-08-01T00:00:00.000Z')), 1);
    assert.equal(await store.get(expired.id), undefined);
    assertMemory((await store.get(active.id))!, {
      type: 'session',
      content: 'Active transient note.',
      metadata: {},
    });
  });
});
