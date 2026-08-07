import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ShellTool } from '../../../src/tools/shell';
import type { Tool, ToolResult } from '../../../src/tools/registry';

async function withTempDir<T>(run: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'shell-tool-'));

  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function getShellExec(): Tool {
  const tool = new ShellTool().getTools().find((candidate: Tool) => candidate.name === 'shell.exec');
  assert.ok(tool, 'Expected shell.exec to be exposed by ShellTool.');
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('ShellTool exposes shell.exec', () => {
  assert.deepEqual(
    new ShellTool().getTools().map((tool: Tool) => tool.name),
    ['shell.exec'],
  );
});

test('shell.exec executes a command and captures stdout', async () => {
  const shellExec = getShellExec();

  const result = await shellExec.execute({
    command: 'node -e "console.log(\'hello from shell\')"',
  });

  assertSuccess(result);
  assert.equal(result.data.stdout, 'hello from shell\n');
  assert.equal(result.data.stderr, '');
  assert.equal(result.data.exitCode, 0);
});

test('shell.exec captures stderr separately from stdout', async () => {
  const shellExec = getShellExec();

  const result = await shellExec.execute({
    command: 'node -e "console.log(\'out\'); console.error(\'err\')"',
  });

  assertSuccess(result);
  assert.equal(result.data.stdout, 'out\n');
  assert.equal(result.data.stderr, 'err\n');
  assert.equal(result.data.exitCode, 0);
});

test('shell.exec runs commands in the requested working directory', async () => {
  await withTempDir(async (rootDir) => {
    const shellExec = getShellExec();

    const result = await shellExec.execute({
      command: 'node -e "console.log(process.cwd())"',
      cwd: rootDir,
    });

    assertSuccess(result);
    assert.equal(path.resolve(String(result.data.stdout).trim()), path.resolve(rootDir));
    assert.equal(result.data.exitCode, 0);
  });
});

test('shell.exec returns a structured failure when the command exits non-zero', async () => {
  const shellExec = getShellExec();

  const result = await shellExec.execute({
    command: 'node -e "console.error(\'boom\'); process.exit(7)"',
  });

  assertFailure(result, /exit code 7|exited with code 7/i);
  const data = assertResultData(result);
  assert.equal(data.stdout, '');
  assert.equal(data.stderr, 'boom\n');
  assert.equal(data.exitCode, 7);
});

test('shell.exec enforces timeoutMs and returns captured output', async () => {
  const shellExec = getShellExec();

  const result = await shellExec.execute({
    command: 'node -e "console.log(\'started\'); setTimeout(() => {}, 2000)"',
    timeoutMs: 50,
  });

  assertFailure(result, /timeout|timed out/i);
  const data = assertResultData(result);
  assert.equal(data.stdout, 'started\n');
  assert.equal(data.stderr, '');
});

test('shell.exec validates required parameters', async () => {
  const shellExec = getShellExec();

  assertFailure(await shellExec.execute({}), /command/i);
  assertFailure(await shellExec.execute({ command: '   ' }), /command/i);
  assertFailure(await shellExec.execute({ command: 'node --version', cwd: 123 }), /cwd/i);
  assertFailure(await shellExec.execute({ command: 'node --version', timeoutMs: -1 }), /timeoutMs/i);
});
