import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAILLM, type OpenAICompatibleClient } from '../../../src/llm/openai';

function createClient(
  handler: OpenAICompatibleClient['chat']['completions']['create'],
): OpenAICompatibleClient {
  return {
    chat: {
      completions: {
        create: handler,
      },
    },
  };
}

test('OpenAILLM calls chat completions and returns text', async () => {
  const requests: unknown[] = [];
  const client = createClient(async (request) => {
    requests.push(request);
    return { choices: [{ message: { content: 'hello' } }] };
  });

  const llm = new OpenAILLM({ client, model: 'test-model', temperature: 0.2 });

  assert.equal(await llm.generate([{ role: 'user', content: 'Hi' }]), 'hello');
  assert.deepEqual(requests, [
    {
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hi' }],
      temperature: 0.2,
      max_tokens: undefined,
    },
  ]);
});

test('OpenAILLM parses generated content into an action', async () => {
  const client = createClient(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            action: {
              type: 'file.write',
              parameters: { path: 'x.txt', content: 'ok' },
              thought: 'Write output',
            },
            finish: false,
            message: '',
          }),
        },
      },
    ],
  }));

  const llm = new OpenAILLM({ client });

  assert.deepEqual(await llm.generateAction([]), {
    id: undefined,
    type: 'file.write',
    parameters: { path: 'x.txt', content: 'ok' },
    thought: 'Write output',
  });
});

test('OpenAILLM retries retryable API errors', async () => {
  let attempts = 0;
  const client = createClient(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw Object.assign(new Error('rate limited'), { status: 429 });
    }

    return { choices: [{ message: { content: 'recovered' } }] };
  });

  const llm = new OpenAILLM({ client, maxRetries: 3 });

  assert.equal(await llm.generate([]), 'recovered');
  assert.equal(attempts, 3);
});

test('OpenAILLM does not retry non-retryable API errors', async () => {
  let attempts = 0;
  const client = createClient(async () => {
    attempts += 1;
    throw Object.assign(new Error('bad request'), { status: 400 });
  });

  const llm = new OpenAILLM({ client, maxRetries: 3 });

  await assert.rejects(() => llm.generate([]), /bad request/);
  assert.equal(attempts, 1);
});
