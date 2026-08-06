import { FailureClassifier } from '../src/feedback/classifier';
import { FeedbackLoop, type FeedbackEntry } from '../src/feedback/loop';
import { TestValidator, type Feedback } from '../src/feedback/validator';
import type { Message } from '../src/llm/base';
import { MockLLM } from '../src/llm/mock';

const FAILING_TEST_OUTPUT = [
  'FAIL src/math/add.test.ts',
  '  adds numbers',
  '    Error: expected 2 but received 3',
  '    at Object.<anonymous> (src/math/add.test.ts:7:10)',
  'Tests: 1 failed, 0 passed, 1 total',
].join('\n');

const PASSING_TEST_OUTPUT = 'Tests: 1 passed, 1 total';

async function main(): Promise<void> {
  console.log('Feedback loop demo: failed test to corrected action');
  console.log('Initial test failure:');
  console.log(FAILING_TEST_OUTPUT);

  const feedback = parseFeedback(FAILING_TEST_OUTPUT);
  const classified = classifyFeedback(feedback);
  console.log(`Feedback parsed: ${classified.length} item(s)`);
  console.log(`Failure category: ${classified[0]?.category ?? 'unknown'}`);
  console.log(`Suggestion: ${classified[0]?.suggestion ?? 'No suggestion.'}`);

  const context = buildFeedbackContext(classified);
  console.log('Agent received feedback context:');
  console.log(context.map((message) => message.content).join('\n'));

  const correction = await generateCorrection(context);
  console.log(`Correction action: ${correction.type}`);
  console.log(`Correction detail: ${JSON.stringify(correction.parameters)}`);

  console.log('Corrected test result:');
  console.log(PASSING_TEST_OUTPUT);
  console.log('Feedback loop success: tests passed after correction.');
}

function parseFeedback(output: string): Feedback[] {
  return new TestValidator().parse(output);
}

function classifyFeedback(feedback: Feedback[]): FeedbackEntry[] {
  const classifier = new FailureClassifier();

  return feedback.map((entry) => {
    const classification = classifier.classify(entry.message);

    return {
      type: entry.type,
      category: classification.category,
      message: classification.message,
      suggestion: classification.suggestion,
      priority: priorityFor(classification.category),
    };
  });
}

function priorityFor(category: FeedbackEntry['category']): number {
  return category === 'logic' ? 8 : 5;
}

function buildFeedbackContext(feedback: FeedbackEntry[]): Message[] {
  const baseContext: Message[] = [
    { role: 'system', content: 'You are a coding agent.' },
    { role: 'user', content: 'Fix the failing test using the feedback.' },
  ];

  return new FeedbackLoop().append(baseContext, feedback);
}

async function generateCorrection(context: Message[]) {
  const llm = new MockLLM({
    actions: [
      {
        type: 'file.write',
        parameters: {
          path: 'src/math/add.ts',
          content: 'export function add(a: number, b: number): number { return a + b; }',
        },
        thought: 'Apply the logic fix described by the feedback.',
      },
    ],
  });

  return llm.generateAction(context);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
