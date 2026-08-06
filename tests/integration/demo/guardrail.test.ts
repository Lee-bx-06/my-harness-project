import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('demo-guardrail deterministically shows guardrail blocking a dangerous action', async () => {
  const result = await execFileAsync(process.execPath, [
    '--require',
    'ts-node/register',
    'scripts/demo-guardrail.ts',
  ], {
    cwd: process.cwd(),
    timeout: 10_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.match(output, /guardrail/i);
  assert.match(output, /rm\s+-rf\s+\//i);
  assert.match(output, /deny|denied|block|blocked/i);
  assert.match(output, /decision|reason|threat|dangerous/i);
});
