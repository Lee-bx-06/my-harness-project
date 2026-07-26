import OpenAI from 'openai';
import {
  type Action,
  type LLMInterface,
  type Message,
  parseActionResponse,
} from './base';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export interface OpenAICompatibleClient {
  chat: {
    completions: {
      create(request: {
        model: string;
        messages: ChatMessage[];
        temperature?: number;
        max_tokens?: number;
      }): Promise<ChatCompletionResponse>;
    };
  };
}

export interface OpenAILLMOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  client?: OpenAICompatibleClient;
}

export class OpenAILLM implements LLMInterface {
  private readonly client: OpenAICompatibleClient;
  private readonly model: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly maxRetries: number;

  constructor(options: OpenAILLMOptions = {}) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      });
    this.model = options.model ?? 'gpt-4.1-mini';
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async generate(messages: Message[]): Promise<string> {
    const response = await this.withRetries(() =>
      this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }),
    );

    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error('OpenAI response did not include message content.');
    }

    return content;
  }

  async generateAction(messages: Message[]): Promise<Action> {
    return parseActionResponse(await this.generate(messages));
  }

  private async withRetries<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries || !this.isRetryable(error)) {
          break;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private isRetryable(error: unknown): boolean {
    const status = this.extractStatus(error);
    return status === undefined || status === 408 || status === 409 || status === 429 || status >= 500;
  }

  private extractStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('status' in error)) {
      return undefined;
    }

    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
}
