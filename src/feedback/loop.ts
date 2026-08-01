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
    const prioritized = [...feedback].sort((left, right) => right.priority - left.priority);
    const limited = typeof options.maxEntries === 'number' ? prioritized.slice(0, options.maxEntries) : prioritized;

    return [
      ...context,
      ...limited.map((entry) => ({
        role: 'assistant' as const,
        content: formatFeedback(entry),
      })),
    ];
  }

  apply(
    context: Message[],
    feedback: FeedbackEntry[],
    options: FeedbackLoopOptions = {},
  ): Message[] {
    return this.append(context, feedback, options);
  }

  run(
    context: Message[],
    feedback: FeedbackEntry[],
    options: FeedbackLoopOptions = {},
  ): Message[] {
    return this.append(context, feedback, options);
  }
}

function formatFeedback(entry: FeedbackEntry): string {
  const parts = [`[${entry.category}]`, entry.message];

  if (entry.suggestion) {
    parts.push(entry.suggestion);
  }

  return parts.join(' ');
}
