import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileTool } from '../../../src/tools/file';
import type { Tool, ToolResult } from '../../../src/tools/registry';

async function withTempDir<T>(run: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'file-tool-'));

  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function getTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected ${name} to be exposed by FileTool.`);
  return tool;
}

function assertSuccess(result: ToolResult): asserts result is ToolResult & {
  success: true;
  data: Record<string, unknown>;
} {
  assert.equal(result.success, true);
  assert.ok(isRecord(result.data));
}

function assertFailure(result: ToolResult, pattern: RegExp): void {
  assert.equal(result.success, false);
  assert.match(result.error ?? '', pattern);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('FileTool exposes read, write, and append tools', async () => {
  await withTempDir(async (rootDir) => {
    const fileTool = new FileTool({ rootDir });

    assert.deepEqual(
      fileTool.getTools().map((tool: Tool) => tool.name),
      ['file.read', 'file.write', 'file.append'],
    );
  });
});

test('file.read reads a text file from the configured root', async () => {
  await withTempDir(async (rootDir) => {
    await writeFile(path.join(rootDir, 'hello.txt'), 'hello world', 'utf8');
    const read = getTool(new FileTool({ rootDir }).getTools(), 'file.read');

    const result = await read.execute({ path: 'hello.txt' });

    assertSuccess(result);
    assert.equal(result.data.content, 'hello world');
    assert.equal(result.data.path, 'hello.txt');
  });
});

test('file.read supports offset and length for chunked reads', async () => {
  await withTempDir(async (rootDir) => {
    await writeFile(path.join(rootDir, 'large.txt'), '0123456789', 'utf8');
    const read = getTool(new FileTool({ rootDir }).getTools(), 'file.read');

    const result = await read.execute({ path: 'large.txt', offset: 2, length: 4 });

    assertSuccess(result);
    assert.equal(result.data.content, '2345');
    assert.equal(result.data.offset, 2);
    assert.equal(result.data.bytesRead, 4);
  });
});

test('file.write writes content atomically and returns write metadata', async () => {
  await withTempDir(async (rootDir) => {
    const write = getTool(new FileTool({ rootDir }).getTools(), 'file.write');

    const result = await write.execute({ path: 'src/example.ts', content: 'export const ok = true;\n' });

    assertSuccess(result);
    assert.equal(result.data.path, 'src/example.ts');
    assert.equal(result.data.bytesWritten, Buffer.byteLength('export const ok = true;\n'));
    assert.equal(await readFile(path.join(rootDir, 'src/example.ts'), 'utf8'), 'export const ok = true;\n');
  });
});

test('file.append appends content to an existing file', async () => {
  await withTempDir(async (rootDir) => {
    await writeFile(path.join(rootDir, 'notes.md'), 'first\n', 'utf8');
    const append = getTool(new FileTool({ rootDir }).getTools(), 'file.append');

    const result = await append.execute({ path: 'notes.md', content: 'second\n' });

    assertSuccess(result);
    assert.equal(result.data.path, 'notes.md');
    assert.equal(result.data.bytesWritten, Buffer.byteLength('second\n'));
    assert.equal(await readFile(path.join(rootDir, 'notes.md'), 'utf8'), 'first\nsecond\n');
  });
});

test('file.read returns a structured failure when the file does not exist', async () => {
  await withTempDir(async (rootDir) => {
    const read = getTool(new FileTool({ rootDir }).getTools(), 'file.read');

    const result = await read.execute({ path: 'missing.txt' });

    assertFailure(result, /not found|no such file/i);
  });
});

test('file.write validates required parameters', async () => {
  await withTempDir(async (rootDir) => {
    const write = getTool(new FileTool({ rootDir }).getTools(), 'file.write');

    assertFailure(await write.execute({ content: 'missing path' }), /path/i);
    assertFailure(await write.execute({ path: 'missing-content.txt' }), /content/i);
  });
});
