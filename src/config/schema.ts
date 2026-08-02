import { z } from 'zod';

export const llmConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1),
  maxTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2),
}).strict();

export const guardrailConfigSchema = z.object({
  enabled: z.boolean(),
  requireConfirmation: z.array(z.string().min(1)),
  allowedDirectories: z.array(z.string().min(1)),
  blockedCommands: z.array(z.string().min(1)),
  allowNetwork: z.boolean(),
}).strict();

export const feedbackConfigSchema = z.object({
  enabled: z.boolean(),
  maxRetries: z.number().int().min(0),
}).strict();

export const memoryConfigSchema = z.object({
  enabled: z.boolean(),
  maxHistory: z.number().int().positive(),
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
