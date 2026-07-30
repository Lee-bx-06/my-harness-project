import assert from 'node:assert/strict';
import test from 'node:test';
import { Sandbox } from '../../../src/guardrail/sandbox';
import type { Action } from '../../../src/llm/base';

function action(type: string, parameters: Record<string, unknown>): Action {
  return { type, parameters };
}

test('Sandbox blocks file operations outside allowed directories', () => {
  const sandbox = new Sandbox({
    allowedDirectories: ['D:/workspace/project'],
  });

  const result = sandbox.check(action('file.write', {
    path: 'D:/workspace/secrets.env',
    content: 'TOKEN=secret',
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.violation?.type, 'directory-boundary');
  assert.match(result.reason ?? '', /allowed directories|outside/i);
});

test('Sandbox allows file operations inside allowed directories', () => {
  const sandbox = new Sandbox({
    allowedDirectories: ['D:/workspace/project'],
  });

  const result = sandbox.check(action('file.write', {
    path: 'D:/workspace/project/src/index.ts',
    content: 'export const ok = true;',
  }));

  assert.deepEqual(result, {
    allowed: true,
  });
});

test('Sandbox blocks blacklisted shell commands', () => {
  const sandbox = new Sandbox({
    blockedCommands: ['format', 'shutdown'],
  });

  const result = sandbox.check(action('shell.exec', {
    command: 'format C:',
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.violation?.type, 'blocked-command');
  assert.equal(result.violation?.value, 'format');
  assert.match(result.reason ?? '', /blocked command/i);
});

test('Sandbox blocks network commands when network access is disabled', () => {
  const sandbox = new Sandbox({
    networkAccess: false,
  });

  const result = sandbox.check(action('shell.exec', {
    command: 'curl https://api.example.com',
  }));

  assert.equal(result.allowed, false);
  assert.equal(result.violation?.type, 'network-access');
  assert.match(result.reason ?? '', /network/i);
});

test('Sandbox allows network commands when network access is enabled', () => {
  const sandbox = new Sandbox({
    networkAccess: true,
  });

  assert.deepEqual(
    sandbox.check(action('shell.exec', { command: 'wget https://example.com/file.txt' })),
    {
      allowed: true,
    },
  );
});
