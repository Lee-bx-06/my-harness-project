import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { GitTool } from '../../../src/tools/git';
import type { Tool, ToolResult } from '../../../src/tools/registry';

const execFileAsync = promisify(execFile);

async function withTempDir<T>(run: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'git-tool-'));

  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function initRepo(rootDir: string): Promise<void> {
  await git(rootDir, 'init');
  await git(rootDir, 'config', 'user.name', 'Test User');
  await git(rootDir, 'config', 'user.email', 'test@example.com');
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

function getTool(tools: Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected ${name} to be exposed by GitTool.`);
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

function assertStatusFiles(value: unknown): asserts value is Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value));
  assert.ok(value.every(isRecord));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('GitTool exposes status and commit tools', () => {
  assert.deepEqual(
    new GitTool().getTools().map((tool: Tool) => tool.name),
    ['git.status', 'git.commit'],
  );
});

test('git.status returns branch, clean flag, raw output, and parsed files', async () => {
  await withTempDir(async (rootDir) => {
    await initRepo(rootDir);
    await writeFile(path.join(rootDir, 'README.md'), '# demo\n', 'utf8');
    const status = getTool(new GitTool().getTools(), 'git.status');

    const result = await status.execute({ cwd: rootDir });

    assertSuccess(result);
    assert.equal(result.data.branch, 'master');
    assert.equal(result.data.clean, false);
    assert.match(String(result.data.raw), /\?\? README\.md/);
    assertStatusFiles(result.data.files);
    assert.deepEqual(result.data.files[0], {
      path: 'README.md',
      index: '?',
      workingTree: '?',
    });
  });
});

test('git.status reports a clean repository after commit', async () => {
  await withTempDir(async (rootDir) => {
    await initRepo(rootDir);
    await writeFile(path.join(rootDir, 'README.md'), '# demo\n', 'utf8');
    await git(rootDir, 'add', 'README.md');
    await git(rootDir, 'commit', '-m', 'initial commit');
    const status = getTool(new GitTool().getTools(), 'git.status');

    const result = await status.execute({ cwd: rootDir });

    assertSuccess(result);
    assert.equal(result.data.clean, true);
    assertStatusFiles(result.data.files);
    assert.equal(result.data.files.length, 0);
  });
});

test('git.commit stages all changes and returns commit metadata', async () => {
  await withTempDir(async (rootDir) => {
    await initRepo(rootDir);
    await writeFile(path.join(rootDir, 'README.md'), '# demo\n', 'utf8');
    const commit = getTool(new GitTool().getTools(), 'git.commit');

    const result = await commit.execute({
      cwd: rootDir,
      message: 'add readme',
    });

    assertSuccess(result);
    assert.equal(result.data.message, 'add readme');
    assert.match(String(result.data.hash), /^[0-9a-f]{7,40}$/);
    assert.equal(result.data.exitCode, 0);

    const status = getTool(new GitTool().getTools(), 'git.status');
    const statusResult = await status.execute({ cwd: rootDir });
    assertSuccess(statusResult);
    assert.equal(statusResult.data.clean, true);
  });
});

test('git.status returns a structured failure outside a git repository', async () => {
  await withTempDir(async (rootDir) => {
    const status = getTool(new GitTool().getTools(), 'git.status');

    const result = await status.execute({ cwd: rootDir });

    assertFailure(result, /not a git repository|not inside a git repository/i);
    const data = assertResultData(result);
    assert.equal(data.exitCode, 128);
    assert.match(String(data.stderr), /not a git repository|not inside a git repository/i);
  });
});

test('git.commit returns a structured failure when user identity is not configured', async () => {
  await withTempDir(async (rootDir) => {
    await git(rootDir, 'init');
    await writeFile(path.join(rootDir, 'README.md'), '# demo\n', 'utf8');
    const commit = getTool(new GitTool().getTools(), 'git.commit');

    const result = await commit.execute({
      cwd: rootDir,
      message: 'add readme',
    });

    assertFailure(result, /user identity|user\.email|user\.name/i);
    const data = assertResultData(result);
    assert.equal(data.exitCode, 128);
  });
});

test('git.commit validates required parameters', async () => {
  const commit = getTool(new GitTool().getTools(), 'git.commit');

  assertFailure(await commit.execute({}), /message/i);
  assertFailure(await commit.execute({ message: '   ' }), /message/i);
  assertFailure(await commit.execute({ message: 'commit', cwd: 123 }), /cwd/i);
});
