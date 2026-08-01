import type { Message } from '../llm/base';

type FeedbackCategory = 'syntax' | 'logic' | 'type' | 'performance' | 'lint';

export interface FeedbackEntry {
  type: 'success' | 'failure';
  category: FeedbackCategory;
  message: string;
  suggestion?: string;
  priority: number;
}

export interface FeedbackLoopOptions {
  maxEntries?: number;
}

export class FeedbackLoop {
  append(
    context: Message[],
    feedback: FeedbackEntry[],
    options: FeedbackLoopOptions = {},
  ): Message[] {
    return this.buildContext(context, feedback, options);
  }

  apply(
    context: Message[],
    feedback: FeedbackEntry[],
    options: FeedbackLoopOptions = {},
  ): Message[] {
    return this.buildContext(context, feedback, options);
  }

  run(
    context: Message[],
    feedback: FeedbackEntry[],
    options: FeedbackLoopOptions = {},
  ): Message[] {
    return this.buildContext(context, feedback, options);
  }

  private buildContext(
    context: Message[],
    feedback: FeedbackEntry[],
    options: FeedbackLoopOptions,
  ): Message[] {
    const entries = this.limitEntries(this.sortByPriority(feedback), options.maxEntries);

    return [...context, ...entries.map((entry) => this.toMessage(entry))];
  }

  private sortByPriority(feedback: FeedbackEntry[]): FeedbackEntry[] {
    return [...feedback].sort((left, right) => right.priority - left.priority);
  }

  private limitEntries(feedback: FeedbackEntry[], maxEntries?: number): FeedbackEntry[] {
    if (typeof maxEntries !== 'number') {
      return feedback;
    }

    return feedback.slice(0, maxEntries);
  }

  private toMessage(entry: FeedbackEntry): Message {
    return {
      role: 'assistant',
      content: formatFeedback(entry),
    };
  }
}

function formatFeedback(entry: FeedbackEntry): string {
  const parts = [`[${entry.category}]`, entry.message];

  if (entry.suggestion) {
    parts.push(entry.suggestion);
  }

  return parts.join(' ');
}
