import {
  type Action,
  type LLMInterface,
  type Message,
  parseActionResponse,
} from './base';

export interface MockLLMOptions {
  responses?: string[];
  actions?: Action[];
  defaultResponse?: string;
  defaultAction?: Action;
  error?: Error | string;
  errorAtCalls?: number[];
}

export class MockLLM implements LLMInterface {
  readonly calls: Message[][] = [];

  private readonly responses: string[];
  private readonly actions: Action[];
  private readonly defaultResponse: string;
  private readonly defaultAction?: Action;
  private readonly error?: Error;
  private readonly errorAtCalls: Set<number>;
  private callCount = 0;

  constructor(options: MockLLMOptions = {}) {
    this.responses = [...(options.responses ?? [])];
    this.actions = [...(options.actions ?? [])];
    this.defaultResponse =
      options.defaultResponse ??
      JSON.stringify({
        action: {
          type: 'finish',
          parameters: {},
          thought: 'Default mock action.',
        },
        finish: true,
        message: '',
      });
    this.defaultAction = options.defaultAction;
    this.error =
      typeof options.error === 'string' ? new Error(options.error) : options.error;
    this.errorAtCalls = new Set(options.errorAtCalls ?? []);
  }

  async generate(messages: Message[]): Promise<string> {
    this.recordCall(messages);
    this.throwIfConfigured();

    return this.responses.shift() ?? this.defaultResponse;
  }

  async generateAction(messages: Message[]): Promise<Action> {
    this.recordCall(messages);
    this.throwIfConfigured();

    const action = this.actions.shift() ?? this.defaultAction;
    if (action) {
      return { ...action, parameters: { ...action.parameters } };
    }

    const response = this.responses.shift() ?? this.defaultResponse;
    return parseActionResponse(response);
  }

  private recordCall(messages: Message[]): void {
    this.callCount += 1;
    this.calls.push(messages.map((message) => ({ ...message })));
  }

  private throwIfConfigured(): void {
    if (this.error && (this.errorAtCalls.size === 0 || this.errorAtCalls.has(this.callCount))) {
      throw this.error;
    }
  }
}
