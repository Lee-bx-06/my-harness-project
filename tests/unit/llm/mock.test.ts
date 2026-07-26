import assert from 'node:assert/strict';
import test from 'node:test';
import { MockLLM } from '../../../src/llm/mock';

test('MockLLM returns configured action sequence', async () => {
  const llm = new MockLLM({
    actions: [
      { type: 'file.read', parameters: { path: 'SPEC.md' }, thought: 'Inspect spec' },
      { type: 'shell.exec', parameters: { command: 'npm test' } },
    ],
  });

  assert.deepEqual(await llm.generateAction([{ role: 'user', content: 'start' }]), {
    type: 'file.read',
    parameters: { path: 'SPEC.md' },
    thought: 'Inspect spec',
  });
  assert.deepEqual(await llm.generateAction([]), {
    type: 'shell.exec',
    parameters: { command: 'npm test' },
  });
  assert.equal(llm.calls.length, 2);
});

test('MockLLM can parse configured text responses into actions', async () => {
  const llm = new MockLLM({
    responses: [
      JSON.stringify({
        action: { type: 'git.status', parameters: { short: true } },
        finish: false,
        message: '',
      }),
    ],
  });

  assert.deepEqual(await llm.generateAction([]), {
    id: undefined,
    type: 'git.status',
    parameters: { short: true },
    thought: undefined,
  });
});

test('MockLLM simulates errors', async () => {
  const llm = new MockLLM({
    defaultResponse: 'ok',
    error: 'mock failure',
    errorAtCalls: [2],
  });

  assert.equal(await llm.generate([]), 'ok');
  await assert.rejects(() => llm.generateAction([]), /mock failure/);
});
