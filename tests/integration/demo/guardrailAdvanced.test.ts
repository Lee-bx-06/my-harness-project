import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('demo-guardrail-advanced shows policy, sandbox, and HITL guardrail dimensions', async () => {
  const result = await execFileAsync(process.execPath, [
    '--require',
    'ts-node/register',
    'scripts/demo-guardrail-advanced.ts',
  ], {
    cwd: process.cwd(),
    timeout: 10_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.match(output, /advanced guardrail|guardrail advanced/i);
  assert.match(output, /policy/i);
  assert.match(output, /allow/i);
  assert.match(output, /deny|denied/i);
  assert.match(output, /sandbox/i);
  assert.match(output, /directory boundary|outside.*director/i);
  assert.match(output, /blocked command|command blacklist/i);
  assert.match(output, /HITL|human-in-the-loop/i);
  assert.match(output, /approved|confirmation approved/i);
  assert.match(output, /rejected|confirmation rejected/i);
});
