import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MemoryRetriever } from '../../../src/memory/retriever';
import { MemoryStore, type MemoryRecord } from '../../../src/memory/store';

type RetrievalResult = MemoryRecord & {
  relevance: number;
};

type RetrieverLike = {
  retrieve?: (
    query: string,
    options?: { limit?: number; type?: MemoryRecord['type'] },
  ) => Promise<RetrievalResult[]>;
  search?: (
    query: string,
    options?: { limit?: number; type?: MemoryRecord['type'] },
  ) => Promise<RetrievalResult[]>;
};

async function withMemoryStore<T>(run: (store: MemoryStore) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'memory-retriever-'));
  const store = new MemoryStore({ databasePath: path.join(rootDir, 'memory.sqlite') });

  try {
    await store.initialize();
    return await run(store);
  } finally {
    await store.close();
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function retrieve(
  store: MemoryStore,
  query: string,
  options?: { limit?: number; type?: MemoryRecord['type'] },
): Promise<RetrievalResult[]> {
  const retriever = new MemoryRetriever(store) as unknown as RetrieverLike;
  const method = retriever.retrieve ?? retriever.search;

  assert.equal(typeof method, 'function', 'Expected MemoryRetriever to expose retrieve() or search().');

  const invoke = method as (
    this: RetrieverLike,
    query: string,
    options?: { limit?: number; type?: MemoryRecord['type'] },
  ) => Promise<RetrievalResult[]>;

  return invoke.call(retriever, query, options);
}

test('MemoryRetriever returns memories that match query keywords', async () => {
  await withMemoryStore(async (store) => {
    await store.save({
      type: 'project',
      content: 'Feedback modules live under src/feedback and parse test output.',
      metadata: { area: 'feedback' },
    });
    await store.save({
      type: 'project',
      content: 'Guardrail policy rules block dangerous shell commands.',
      metadata: { area: 'guardrail' },
    });

    const results = await retrieve(store, 'feedback test output');

    assert.equal(results.length, 1);
    assert.equal(results[0].content, 'Feedback modules live under src/feedback and parse test output.');
    assert.equal(results[0].type, 'project');
    assert.ok(results[0].relevance > 0);
  });
});

test('MemoryRetriever sorts matches by descending relevance', async () => {
  await withMemoryStore(async (store) => {
    await store.save({
      type: 'project',
      content: 'Tests are run with node:test.',
      metadata: {},
    });
    await store.save({
      type: 'project',
      content: 'Memory tests use node:test and verify memory persistence.',
      metadata: {},
    });
    await store.save({
      type: 'project',
      content: 'Use SQLite for persistent memory storage.',
      metadata: {},
    });

    const results = await retrieve(store, 'memory test persistence');

    assert.deepEqual(
      results.map((result) => result.content),
      [
        'Memory tests use node:test and verify memory persistence.',
        'Use SQLite for persistent memory storage.',
        'Tests are run with node:test.',
      ],
    );
    assert.ok(results[0].relevance >= results[1].relevance);
    assert.ok(results[1].relevance >= results[2].relevance);
  });
});

test('MemoryRetriever applies type and limit options', async () => {
  await withMemoryStore(async (store) => {
    await store.save({
      type: 'session',
      content: 'Session memory notes that the user asked for TDD.',
      metadata: {},
    });
    await store.save({
      type: 'project',
      content: 'Project memory records the TDD commit workflow.',
      metadata: {},
    });
    await store.save({
      type: 'project',
      content: 'Project memory stores module ownership notes.',
      metadata: {},
    });

    const results = await retrieve(store, 'memory project TDD', { type: 'project', limit: 1 });

    assert.equal(results.length, 1);
    assert.equal(results[0].type, 'project');
    assert.match(results[0].content, /project/i);
  });
});
