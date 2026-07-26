export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: MessageRole;
  content: string;
}

export interface Action {
  id?: string;
  type: string;
  parameters: Record<string, unknown>;
  thought?: string;
}

export interface LLMInterface {
  generate(messages: Message[]): Promise<string>;
  generateAction(messages: Message[]): Promise<Action>;
}

export interface LLMActionEnvelope {
  action?: Action;
  finish?: boolean;
  message?: string;
}

export class LLMActionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMActionParseError';
  }
}

export function parseActionResponse(response: string): Action {
  const parsed = parseJsonObject(response);
  const envelope = parsed as LLMActionEnvelope;

  if (!isRecord(envelope.action)) {
    throw new LLMActionParseError('LLM response does not contain an action object.');
  }

  const { action } = envelope;

  if (typeof action.type !== 'string' || action.type.trim() === '') {
    throw new LLMActionParseError('LLM action is missing a valid type.');
  }

  if (!isRecord(action.parameters)) {
    throw new LLMActionParseError('LLM action parameters must be an object.');
  }

  return {
    id: typeof action.id === 'string' ? action.id : undefined,
    type: action.type,
    parameters: action.parameters,
    thought: typeof action.thought === 'string' ? action.thought : undefined,
  };
}

function parseJsonObject(response: string): unknown {
  const trimmed = response.trim();
  const json = extractJsonFromFence(trimmed) ?? trimmed;

  try {
    return JSON.parse(json);
  } catch (error) {
    throw new LLMActionParseError(
      `LLM response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function extractJsonFromFence(response: string): string | undefined {
  const match = response.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
