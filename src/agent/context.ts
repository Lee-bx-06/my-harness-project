import type { Message } from '../llm/base';

export interface ContextTool {
  name: string;
  output: string;
}

export interface ContextFeedback {
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  suggestion?: string;
}

export interface ContextInput {
  systemPrompt: string;
  messages: Message[];
  tools?: ContextTool[];
  feedback?: ContextFeedback[];
}

export interface ContextPersistence {
  save(sessionId: string, messages: Message[]): Promise<void>;
  load(sessionId: string): Promise<Message[] | undefined>;
}

export interface ContextManagerOptions {
  maxHistory?: number;
  persistence?: ContextPersistence;
}

export class ContextManager {
  private readonly maxHistory?: number;
  private readonly persistence?: ContextPersistence;

  constructor(options: ContextManagerOptions = {}) {
    this.maxHistory = options.maxHistory;
    this.persistence = options.persistence;
  }

  build(input: ContextInput): Message[] {
    const messages: Message[] = [{ role: 'system', content: input.systemPrompt }];
    const conversation = this.applyHistoryLimit(input.messages);

    if (conversation.summary) {
      messages.push({ role: 'assistant', content: conversation.summary });
    }

    messages.push(...conversation.messages);
    messages.push(...this.formatTools(input.tools ?? []));
    messages.push(...this.formatFeedback(input.feedback ?? []));

    return messages;
  }

  compose(input: ContextInput): Message[] {
    return this.build(input);
  }

  organize(input: ContextInput): Message[] {
    return this.build(input);
  }

  async persist(sessionId: string, messages: Message[]): Promise<void> {
    if (!this.persistence) {
      return;
    }

    await this.persistence.save(sessionId, this.cloneMessages(messages));
  }

  async save(sessionId: string, messages: Message[]): Promise<void> {
    await this.persist(sessionId, messages);
  }

  async restore(sessionId: string): Promise<Message[] | undefined> {
    if (!this.persistence) {
      return undefined;
    }

    const messages = await this.persistence.load(sessionId);
    return messages?.map((message) => ({ ...message }));
  }

  async load(sessionId: string): Promise<Message[] | undefined> {
    return this.restore(sessionId);
  }

  private applyHistoryLimit(messages: Message[]): { messages: Message[]; summary?: string } {
    if (typeof this.maxHistory !== 'number' || this.maxHistory < 0 || messages.length <= this.maxHistory) {
      return { messages: this.cloneMessages(messages) };
    }

    const omitted = messages.length - this.maxHistory;
    return {
      summary: `Summary: ${omitted} earlier message${omitted === 1 ? '' : 's'} omitted.`,
      messages: this.cloneMessages(messages.slice(-this.maxHistory)),
    };
  }

  private formatTools(tools: ContextTool[]): Message[] {
    return tools.map((tool) => ({
      role: 'assistant',
      content: `Tool ${tool.name}: ${tool.output}`,
    }));
  }

  private formatFeedback(feedback: ContextFeedback[]): Message[] {
    return feedback.map((entry) => {
      const parts = [`Feedback [${entry.category}]:`, entry.message];

      if (entry.suggestion) {
        parts.push(entry.suggestion);
      }

      return {
        role: 'assistant',
        content: parts.join(' '),
      };
    });
  }

  private cloneMessages(messages: Message[]): Message[] {
    return messages.map((message) => ({ ...message }));
  }
}
