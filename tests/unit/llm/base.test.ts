import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LLMActionParseError,
  type LLMInterface,
  type Message,
  parseActionResponse,
} from '../../../src/llm/base';

test('LLMInterface accepts implementations with generate and generateAction', async () => {
  const llm: LLMInterface = {
    async generate(messages: Message[]) {
      return messages.at(-1)?.content ?? '';
    },
    async generateAction() {
      return { type: 'file.read', parameters: { path: 'PLAN.md' } };
    },
  };

  assert.equal(await llm.generate([{ role: 'user', content: 'hello' }]), 'hello');
  assert.deepEqual(await llm.generateAction([]), {
    type: 'file.read',
    parameters: { path: 'PLAN.md' },
  });
});

test('parseActionResponse parses the required action envelope', () => {
  const action = parseActionResponse(`{
    "action": {
      "type": "shell.exec",
      "parameters": { "command": "npm test" },
      "thought": "Run tests"
    },
    "finish": false,
    "message": ""
  }`);

  assert.deepEqual(action, {
    id: undefined,
    type: 'shell.exec',
    parameters: { command: 'npm test' },
    thought: 'Run tests',
  });
});

test('parseActionResponse rejects invalid action JSON', () => {
  assert.throws(
    () => parseActionResponse('{"finish": true, "message": "done"}'),
    LLMActionParseError,
  );
});
