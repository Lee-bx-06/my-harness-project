import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configSchema, type Config } from './schema';

export type ConfigLoaderOptions = {
  defaults: Config;
  env?: NodeJS.ProcessEnv;
};

type ConfigInput = Record<string, unknown>;

export class ConfigLoader {
  private readonly defaults: Config;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: ConfigLoaderOptions) {
    this.defaults = configSchema.parse(options.defaults);
    this.env = options.env ?? process.env;
  }

  async load(configPath: string): Promise<Config> {
    const content = await readFile(configPath, 'utf8');
    const userConfig = parseConfigFile(configPath, content);
    const merged = deepMerge(this.defaults, userConfig);
    const withEnv = applyEnvOverrides(merged, this.env);

    return configSchema.parse(withEnv);
  }
}

function parseConfigFile(configPath: string, content: string): ConfigInput {
  const extension = path.extname(configPath).toLowerCase();

  if (extension === '.json') {
    return JSON.parse(content) as ConfigInput;
  }

  if (extension === '.yaml' || extension === '.yml') {
    return parseYamlConfig(content);
  }

  throw new Error(`Unsupported config file format: ${extension}`);
}

function parseYamlConfig(content: string): ConfigInput {
  const root: ConfigInput = {};
  let currentSection: ConfigInput | null = null;
  let currentArrayKey: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');

    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }

    if (!line.startsWith(' ')) {
      const section = line.trim().replace(/:$/, '');
      currentSection = {};
      root[section] = currentSection;
      currentArrayKey = null;
      continue;
    }

    if (currentSection === null) {
      throw new Error('Invalid YAML config.');
    }

    const trimmed = line.trim();

    if (trimmed.startsWith('- ')) {
      const arrayValue = currentArrayKey === null ? null : currentSection[currentArrayKey];

      if (!Array.isArray(arrayValue)) {
        throw new Error('Invalid YAML config.');
      }

      arrayValue.push(parseScalar(trimmed.slice(2)));
      continue;
    }

    const separator = trimmed.indexOf(':');

    if (separator === -1) {
      throw new Error('Invalid YAML config.');
    }

    const key = trimmed.slice(0, separator);
    const rawValue = trimmed.slice(separator + 1).trim();

    if (rawValue === '') {
      currentSection[key] = [];
      currentArrayKey = key;
    } else {
      currentSection[key] = parseScalar(rawValue);
      currentArrayKey = null;
    }
  }

  return root;
}

function parseScalar(value: string): string | number | boolean {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  const numeric = Number(value);

  if (value.trim() !== '' && Number.isFinite(numeric)) {
    return numeric;
  }

  return value;
}

function deepMerge(base: ConfigInput, override: ConfigInput): ConfigInput {
  const merged: ConfigInput = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];

    if (isPlainObject(baseValue) && isPlainObject(value)) {
      merged[key] = deepMerge(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function applyEnvOverrides(config: ConfigInput, env: NodeJS.ProcessEnv): ConfigInput {
  const result = deepMerge({}, config);

  applyStringOverride(result, ['llm', 'provider'], env.AGENT_LLM_PROVIDER);
  applyStringOverride(result, ['llm', 'model'], env.AGENT_LLM_MODEL);
  applyStringOverride(result, ['llm', 'apiKeyEnv'], env.AGENT_LLM_API_KEY_ENV);
  applyNumberOverride(result, ['llm', 'maxTokens'], env.AGENT_LLM_MAX_TOKENS);
  applyNumberOverride(result, ['llm', 'temperature'], env.AGENT_LLM_TEMPERATURE);
  applyBooleanOverride(result, ['guardrail', 'enabled'], env.AGENT_GUARDRAIL_ENABLED);
  applyBooleanOverride(result, ['guardrail', 'allowNetwork'], env.AGENT_GUARDRAIL_ALLOW_NETWORK);
  applyBooleanOverride(result, ['feedback', 'enabled'], env.AGENT_FEEDBACK_ENABLED);
  applyNumberOverride(result, ['feedback', 'maxRetries'], env.AGENT_FEEDBACK_MAX_RETRIES);
  applyBooleanOverride(result, ['memory', 'enabled'], env.AGENT_MEMORY_ENABLED);
  applyNumberOverride(result, ['memory', 'maxHistory'], env.AGENT_MEMORY_MAX_HISTORY);

  return result;
}

function applyStringOverride(config: ConfigInput, pathSegments: string[], value: string | undefined): void {
  if (value !== undefined) {
    setNestedValue(config, pathSegments, value);
  }
}

function applyNumberOverride(config: ConfigInput, pathSegments: string[], value: string | undefined): void {
  if (value !== undefined) {
    setNestedValue(config, pathSegments, Number(value));
  }
}

function applyBooleanOverride(config: ConfigInput, pathSegments: string[], value: string | undefined): void {
  if (value !== undefined) {
    setNestedValue(config, pathSegments, value === 'true');
  }
}

function setNestedValue(config: ConfigInput, pathSegments: string[], value: unknown): void {
  let current = config;

  for (const segment of pathSegments.slice(0, -1)) {
    const next = current[segment];

    if (!isPlainObject(next)) {
      current[segment] = {};
    }

    current = current[segment] as ConfigInput;
  }

  current[pathSegments[pathSegments.length - 1]] = value;
}

function isPlainObject(value: unknown): value is ConfigInput {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
