import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigLoader } from '../../../src/config/loader';
import type { Config } from '../../../src/config/schema';

async function withTempDir<T>(run: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'config-loader-'));

  try {
    return await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function defaultConfig(): Config {
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

test('ConfigLoader loads and validates a JSON configuration file', async () => {
  await withTempDir(async (rootDir) => {
    const configPath = path.join(rootDir, 'agent.json');
    const config = {
      ...defaultConfig(),
      llm: {
        ...defaultConfig().llm,
        model: 'gpt-4.1',
      },
    };
    await writeFile(configPath, JSON.stringify(config), 'utf8');

    const loader = new ConfigLoader({ defaults: defaultConfig(), env: {} });

    assert.deepEqual(await loader.load(configPath), config);
  });
});

test('ConfigLoader loads YAML configuration files', async () => {
  await withTempDir(async (rootDir) => {
    const configPath = path.join(rootDir, 'agent.yaml');
    await writeFile(
      configPath,
      [
        'llm:',
        '  provider: openai',
        '  model: gpt-4.1',
        '  apiKeyEnv: OPENAI_API_KEY',
        '  maxTokens: 2048',
        '  temperature: 0.1',
        'guardrail:',
        '  enabled: true',
        '  requireConfirmation:',
        '    - shell.exec',
        '  allowedDirectories:',
        '    - .',
        '  blockedCommands:',
        '    - rm -rf /',
        '  allowNetwork: false',
        'feedback:',
        '  enabled: true',
        '  maxRetries: 2',
        'memory:',
        '  enabled: true',
        '  maxHistory: 25',
      ].join('\n'),
      'utf8',
    );

    const loader = new ConfigLoader({ defaults: defaultConfig(), env: {} });
    const loaded = await loader.load(configPath);

    assert.equal(loaded.llm.model, 'gpt-4.1');
    assert.equal(loaded.llm.maxTokens, 2048);
    assert.deepEqual(loaded.guardrail.requireConfirmation, ['shell.exec']);
    assert.equal(loaded.feedback.maxRetries, 2);
    assert.equal(loaded.memory.maxHistory, 25);
  });
});

test('ConfigLoader deep merges user configuration with defaults', async () => {
  await withTempDir(async (rootDir) => {
    const configPath = path.join(rootDir, 'agent.json');
    await writeFile(
      configPath,
      JSON.stringify({
        llm: {
          model: 'gpt-4.1',
        },
        feedback: {
          maxRetries: 1,
        },
      }),
      'utf8',
    );

    const loader = new ConfigLoader({ defaults: defaultConfig(), env: {} });
    const loaded = await loader.load(configPath);

    assert.equal(loaded.llm.model, 'gpt-4.1');
    assert.equal(loaded.llm.provider, defaultConfig().llm.provider);
    assert.equal(loaded.guardrail.allowNetwork, defaultConfig().guardrail.allowNetwork);
    assert.equal(loaded.feedback.maxRetries, 1);
    assert.equal(loaded.memory.maxHistory, defaultConfig().memory.maxHistory);
  });
});

test('ConfigLoader applies environment variable overrides after file merging', async () => {
  await withTempDir(async (rootDir) => {
    const configPath = path.join(rootDir, 'agent.json');
    await writeFile(
      configPath,
      JSON.stringify({
        llm: {
          model: 'gpt-4.1',
          maxTokens: 2048,
        },
        feedback: {
          maxRetries: 1,
        },
      }),
      'utf8',
    );

    const loader = new ConfigLoader({
      defaults: defaultConfig(),
      env: {
        AGENT_LLM_MODEL: 'gpt-4.1-mini-env',
        AGENT_LLM_MAX_TOKENS: '8192',
        AGENT_FEEDBACK_MAX_RETRIES: '5',
      },
    });
    const loaded = await loader.load(configPath);

    assert.equal(loaded.llm.model, 'gpt-4.1-mini-env');
    assert.equal(loaded.llm.maxTokens, 8192);
    assert.equal(loaded.feedback.maxRetries, 5);
  });
});
