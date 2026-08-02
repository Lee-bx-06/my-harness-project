import { z } from 'zod';

const nonEmptyString = z.string().min(1);
const nonEmptyStringList = z.array(nonEmptyString);
const positiveInteger = z.number().int().positive();
const nonNegativeInteger = z.number().int().min(0);

export const llmConfigSchema = z.object({
  provider: nonEmptyString,
  model: nonEmptyString,
  apiKeyEnv: nonEmptyString,
  maxTokens: positiveInteger,
  temperature: z.number().min(0).max(2),
}).strict();

export const guardrailConfigSchema = z.object({
  enabled: z.boolean(),
  requireConfirmation: nonEmptyStringList,
  allowedDirectories: nonEmptyStringList,
  blockedCommands: nonEmptyStringList,
  allowNetwork: z.boolean(),
}).strict();

export const feedbackConfigSchema = z.object({
  enabled: z.boolean(),
  maxRetries: nonNegativeInteger,
}).strict();

export const memoryConfigSchema = z.object({
  enabled: z.boolean(),
  maxHistory: positiveInteger,
}).strict();

export const configSchema = z.object({
  llm: llmConfigSchema,
  guardrail: guardrailConfigSchema,
  feedback: feedbackConfigSchema,
  memory: memoryConfigSchema,
}).strict();

export type LLMConfig = z.infer<typeof llmConfigSchema>;
export type GuardrailConfig = z.infer<typeof guardrailConfigSchema>;
export type FeedbackConfig = z.infer<typeof feedbackConfigSchema>;
export type MemoryConfig = z.infer<typeof memoryConfigSchema>;
export type Config = z.infer<typeof configSchema>;
