import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TestTool } from '../../../src/tools/test';
import type { Tool, ToolResult } from '../../../src/tools/registry';

async function withTempDir<T>(run: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'test-tool-'));

  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function getTestRun(): Tool {
  const tool = new TestTool().getTools().find((candidate: Tool) => candidate.name === 'test.run');
  assert.ok(tool, 'Expected test.run to be exposed by TestTool.');
  return tool;
}

function assertSuccess(result: ToolResult): asserts result is ToolResult & {
  success: true;
  data: Record<string, unknown>;
} {
  assert.equal(result.success, true);
  assert.ok(isRecord(result.data));
}

function assertFailure(result: ToolResult, pattern: RegExp): asserts result is ToolResult & {
  success: false;
} {
  assert.equal(result.success, false);
  assert.match(result.error ?? '', pattern);
}

function assertResultData(result: ToolResult): Record<string, unknown> {
  const data = (result as ToolResult & { data?: unknown }).data;
  assert.ok(isRecord(data));
  return data;
}

function assertFailureList(value: unknown): asserts value is Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value));
  assert.ok(value.every(isRecord));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('TestTool exposes test.run', () => {
  assert.deepEqual(
    new TestTool().getTools().map((tool: Tool) => tool.name),
    ['test.run'],
  );
});

test('test.run executes a passing test command and returns structured output', async () => {
  const testRun = getTestRun();

  const result = await testRun.execute({
    command: 'node -e "console.log(\'Tests: 2 passed, 2 total\')"',
  });

  assertSuccess(result);
  assert.equal(result.data.passed, true);
  assert.equal(result.data.framework, 'jest');
  assert.equal(result.data.total, 2);
  assert.equal(result.data.passedCount, 2);
  assert.equal(result.data.failedCount, 0);
  assert.equal(result.data.exitCode, 0);
  assert.equal(result.data.stdout, 'Tests: 2 passed, 2 total\n');
  assert.equal(result.data.stderr, '');
});

test('test.run runs commands in the requested working directory', async () => {
  await withTempDir(async (rootDir) => {
    const testRun = getTestRun();

    const result = await testRun.execute({
      command: 'node -e "console.log(process.cwd()); console.log(\'Tests: 1 passed, 1 total\')"',
      cwd: rootDir,
    });

    assertSuccess(result);
    assert.equal(String(result.data.stdout).split(/\r?\n/)[0], path.resolve(rootDir));
    assert.equal(result.data.total, 1);
    assert.equal(result.data.passedCount, 1);
  });
});

test('test.run parses a failing Jest summary and returns failure metadata', async () => {
  const testRun = getTestRun();

  const result = await testRun.execute({
    command: 'node -e "console.log(\'FAIL math subtracts numbers\'); console.log(\'Tests: 1 failed, 1 passed, 2 total\'); process.exit(1)"',
  });

  assertFailure(result, /tests failed|exit code 1/i);
  const data = assertResultData(result);
  assert.equal(data.passed, false);
  assert.equal(data.framework, 'jest');
  assert.equal(data.total, 2);
  assert.equal(data.passedCount, 1);
  assert.equal(data.failedCount, 1);
  assertFailureList(data.failures);
  assert.deepEqual(data.failures[0], {
    name: 'math subtracts numbers',
    message: 'FAIL math subtracts numbers',
  });
});

test('test.run parses a failing Mocha summary and failure title', async () => {
  const testRun = getTestRun();

  const result = await testRun.execute({
    command: 'node -e "console.log(\'  1 passing (5ms)\'); console.log(\'  1 failing\'); console.log(\'  1) calculator adds numbers\'); process.exit(1)"',
  });

  assertFailure(result, /tests failed|exit code 1/i);
  const data = assertResultData(result);
  assert.equal(data.passed, false);
  assert.equal(data.framework, 'mocha');
  assert.equal(data.total, 2);
  assert.equal(data.passedCount, 1);
  assert.equal(data.failedCount, 1);
  assertFailureList(data.failures);
  assert.deepEqual(data.failures[0], {
    name: 'calculator adds numbers',
    message: '1) calculator adds numbers',
  });
});

test('test.run validates required parameters', async () => {
  const testRun = getTestRun();

  assertFailure(await testRun.execute({}), /command/i);
  assertFailure(await testRun.execute({ command: '   ' }), /command/i);
  assertFailure(await testRun.execute({ command: 'node --test', cwd: 123 }), /cwd/i);
});
