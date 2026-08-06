import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('demo-feedback deterministically shows the feedback loop correcting a failed test', async () => {
  const result = await execFileAsync(process.execPath, [
    '--require',
    'ts-node/register',
    'scripts/demo-feedback.ts',
  ], {
    cwd: process.cwd(),
    timeout: 10_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.match(output, /feedback loop/i);
  assert.match(output, /test failure|tests failed|failing test/i);
  assert.match(output, /feedback parsed|parsed feedback|failure category/i);
  assert.match(output, /agent received feedback|received feedback|feedback context/i);
  assert.match(output, /correction|corrected|fix/i);
  assert.match(output, /tests passed|passing test|success/i);
});
