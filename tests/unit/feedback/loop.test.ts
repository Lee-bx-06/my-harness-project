import assert from 'node:assert/strict';
import test from 'node:test';
import { FeedbackLoop } from '../../../src/feedback/loop';
import type { Message } from '../../../src/llm/base';

type FeedbackItem = {
  type: 'success' | 'failure';
  category: 'syntax' | 'logic' | 'type' | 'performance' | 'lint';
  message: string;
  suggestion?: string;
  priority: number;
};

type LoopLike = {
  append?: (context: Message[], feedback: FeedbackItem[], options?: Record<string, unknown>) => Message[];
  apply?: (context: Message[], feedback: FeedbackItem[], options?: Record<string, unknown>) => Message[];
  run?: (context: Message[], feedback: FeedbackItem[], options?: Record<string, unknown>) => Message[];
};

function runLoop(
  context: Message[],
  feedback: FeedbackItem[],
  options?: Record<string, unknown>,
): Message[] {
  const loop = new FeedbackLoop() as unknown as LoopLike;
  const method = loop.append ?? loop.apply ?? loop.run;

  assert.equal(typeof method, 'function', 'Expected FeedbackLoop to expose append(), apply(), or run().');

  return (method as (context: Message[], feedback: FeedbackItem[], options?: Record<string, unknown>) => Message[]).call(
    loop,
    context,
    feedback,
    options,
  );
}

test('FeedbackLoop appends prioritized feedback to the end of the context', () => {
  const context: Message[] = [
    { role: 'system', content: 'You are a coding agent.' },
    { role: 'user', content: 'Run the current tests.' },
  ];

  const updated = runLoop(context, [
    { type: 'failure', category: 'lint', message: 'no-console warning', priority: 1 },
    { type: 'failure', category: 'syntax', message: 'parser failed', priority: 10 },
    { type: 'failure', category: 'logic', message: 'assertion mismatch', priority: 5 },
  ]);

  assert.ok(updated.length >= context.length + 1);
  assert.deepEqual(updated.slice(0, context.length), context);

  const feedbackText = updated.slice(context.length).map((message) => message.content).join('\n');
  assert.match(feedbackText, /parser failed/i);
  assert.match(feedbackText, /assertion mismatch/i);
  assert.match(feedbackText, /no-console warning/i);
  assert.ok(
    feedbackText.indexOf('parser failed') < feedbackText.indexOf('assertion mismatch'),
    'Expected higher priority feedback to appear first.',
  );
  assert.ok(
    feedbackText.indexOf('assertion mismatch') < feedbackText.indexOf('no-console warning'),
    'Expected lower priority feedback to appear last.',
  );
});

test('FeedbackLoop limits feedback volume when maxEntries is configured', () => {
  const context: Message[] = [{ role: 'user', content: 'Investigate the failure.' }];

  const updated = runLoop(
    context,
    [
      { type: 'failure', category: 'performance', message: 'timeout warning', priority: 8 },
      { type: 'failure', category: 'type', message: 'type mismatch', priority: 6 },
      { type: 'failure', category: 'lint', message: 'format issue', priority: 1 },
    ],
    { maxEntries: 2 },
  );

  const feedbackText = updated.slice(context.length).map((message) => message.content).join('\n');
  assert.match(feedbackText, /timeout warning/i);
  assert.match(feedbackText, /type mismatch/i);
  assert.doesNotMatch(feedbackText, /format issue/i);
});
