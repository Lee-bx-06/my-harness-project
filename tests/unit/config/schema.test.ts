import assert from 'node:assert/strict';
import test from 'node:test';
import { configSchema, type Config } from '../../../src/config/schema';

function validConfig(): Config {
  return {
    llm: {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKeyEnv: 'OPENAI_API_KEY',
      maxTokens: 4096,
      temperature: 0.2,
    },
    guardrail: {
      enabled: true,
      requireConfirmation: ['shell.exec', 'git.push'],
      allowedDirectories: ['.'],
      blockedCommands: ['rm -rf /', 'git push --force'],
      allowNetwork: false,
    },
    feedback: {
      enabled: true,
      maxRetries: 3,
    },
    memory: {
      enabled: true,
      maxHistory: 50,
    },
  };
}

test('configSchema accepts a complete harness configuration', () => {
  const config = validConfig();

  assert.deepEqual(configSchema.parse(config), config);
});

test('configSchema requires all top-level configuration sections', () => {
  const { llm: _llm, ...missingLlm } = validConfig();

  assert.throws(
    () => configSchema.parse(missingLlm),
    /llm|required/i,
  );
});

test('configSchema validates LLM numeric limits', () => {
  assert.throws(
    () => configSchema.parse({
      ...validConfig(),
      llm: {
        ...validConfig().llm,
        maxTokens: 0,
      },
    }),
    /maxTokens/i,
  );

  assert.throws(
    () => configSchema.parse({
      ...validConfig(),
      llm: {
        ...validConfig().llm,
        temperature: 2.5,
      },
    }),
    /temperature/i,
  );
});

test('configSchema validates feedback and memory limits', () => {
  assert.throws(
    () => configSchema.parse({
      ...validConfig(),
      feedback: {
        ...validConfig().feedback,
        maxRetries: -1,
      },
    }),
    /maxRetries/i,
  );

  assert.throws(
    () => configSchema.parse({
      ...validConfig(),
      memory: {
        ...validConfig().memory,
        maxHistory: 0,
      },
    }),
    /maxHistory/i,
  );
});

test('configSchema rejects unknown configuration keys', () => {
  assert.throws(
    () => configSchema.parse({
      ...validConfig(),
      secrets: {
        apiKey: 'do-not-store-plain-text-keys',
      },
    }),
    /unrecognized|unknown|secrets/i,
  );
});
