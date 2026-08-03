import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { configSchema, type Config } from './schema';

const CONFIG_FILE_ENCODING = 'utf8';
const JSON_EXTENSIONS = new Set(['.json']);
const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

export type ConfigLoaderOptions = {
  defaults: Config;
  env?: NodeJS.ProcessEnv;
};

type ConfigInput = Record<string, unknown>;
type EnvOverride = {
  name: string;
  path: string[];
  parse: (value: string) => unknown;
};

const ENV_OVERRIDES: EnvOverride[] = [
  { name: 'AGENT_LLM_PROVIDER', path: ['llm', 'provider'], parse: parseString },
  { name: 'AGENT_LLM_MODEL', path: ['llm', 'model'], parse: parseString },
  { name: 'AGENT_LLM_API_KEY_ENV', path: ['llm', 'apiKeyEnv'], parse: parseString },
  { name: 'AGENT_LLM_MAX_TOKENS', path: ['llm', 'maxTokens'], parse: parseNumber },
  { name: 'AGENT_LLM_TEMPERATURE', path: ['llm', 'temperature'], parse: parseNumber },
  { name: 'AGENT_GUARDRAIL_ENABLED', path: ['guardrail', 'enabled'], parse: parseBoolean },
  { name: 'AGENT_GUARDRAIL_ALLOW_NETWORK', path: ['guardrail', 'allowNetwork'], parse: parseBoolean },
  { name: 'AGENT_FEEDBACK_ENABLED', path: ['feedback', 'enabled'], parse: parseBoolean },
  { name: 'AGENT_FEEDBACK_MAX_RETRIES', path: ['feedback', 'maxRetries'], parse: parseNumber },
  { name: 'AGENT_MEMORY_ENABLED', path: ['memory', 'enabled'], parse: parseBoolean },
  { name: 'AGENT_MEMORY_MAX_HISTORY', path: ['memory', 'maxHistory'], parse: parseNumber },
];

export class ConfigLoader {
  private readonly defaults: Config;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: ConfigLoaderOptions) {
    this.defaults = configSchema.parse(options.defaults);
    this.env = options.env ?? process.env;
  }

  async load(configPath: string): Promise<Config> {
    const content = await readFile(configPath, CONFIG_FILE_ENCODING);
    const userConfig = parseConfigFile(configPath, content);
    const merged = deepMerge(this.defaults, userConfig);
    const withEnv = applyEnvOverrides(merged, this.env);

    return configSchema.parse(withEnv);
  }
}

function parseConfigFile(configPath: string, content: string): ConfigInput {
  const extension = path.extname(configPath).toLowerCase();

  if (JSON_EXTENSIONS.has(extension)) {
    return JSON.parse(content) as ConfigInput;
  }

  if (YAML_EXTENSIONS.has(extension)) {
    return parseYamlConfig(content);
  }

  throw new Error(`Unsupported config file format: ${extension}`);
}

function parseYamlConfig(content: string): ConfigInput {
  const root: ConfigInput = {};
  let currentSection: ConfigInput | null = null;
  let currentArrayKey: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripYamlComment(rawLine);

    if (isBlankOrComment(line)) {
      continue;
    }

    const trimmed = line.trim();

    if (isTopLevelYamlKey(line)) {
      currentSection = createSection(root, trimmed);
      currentArrayKey = null;
      continue;
    }

    if (currentSection === null) {
      throw new Error('Invalid YAML config.');
    }

    if (isYamlArrayItem(trimmed)) {
      appendArrayItem(currentSection, currentArrayKey, trimmed);
      continue;
    }

    const { key, value } = parseYamlKeyValue(trimmed);

    if (value === '') {
      currentSection[key] = [];
      currentArrayKey = key;
    } else {
      currentSection[key] = parseScalar(value);
      currentArrayKey = null;
    }
  }

  return root;
}

function stripYamlComment(line: string): string {
  return line.replace(/\s+#.*$/, '');
}

function isBlankOrComment(line: string): boolean {
  return line.trim() === '' || line.trimStart().startsWith('#');
}

function isTopLevelYamlKey(line: string): boolean {
  return !line.startsWith(' ');
}

function isYamlArrayItem(line: string): boolean {
  return line.startsWith('- ');
}

function createSection(root: ConfigInput, line: string): ConfigInput {
  const section = line.replace(/:$/, '');
  const value: ConfigInput = {};
  root[section] = value;

  return value;
}

function appendArrayItem(section: ConfigInput, arrayKey: string | null, line: string): void {
  const arrayValue = arrayKey === null ? null : section[arrayKey];

  if (!Array.isArray(arrayValue)) {
    throw new Error('Invalid YAML config.');
  }

  arrayValue.push(parseScalar(line.slice(2)));
}

function parseYamlKeyValue(line: string): { key: string; value: string } {
  const separator = line.indexOf(':');

  if (separator === -1) {
    throw new Error('Invalid YAML config.');
  }

  return {
    key: line.slice(0, separator),
    value: line.slice(separator + 1).trim(),
  };
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

  for (const override of ENV_OVERRIDES) {
    const value = env[override.name];

    if (value !== undefined) {
      setNestedValue(result, override.path, override.parse(value));
    }
  }

  return result;
}

function parseString(value: string): string {
  return value;
}

function parseNumber(value: string): number {
  return Number(value);
}

function parseBoolean(value: string): boolean {
  return value === 'true';
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
