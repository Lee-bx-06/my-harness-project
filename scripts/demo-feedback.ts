import { FailureClassifier } from '../src/feedback/classifier';
import { FeedbackLoop, type FeedbackEntry } from '../src/feedback/loop';
import { TestValidator, type Feedback } from '../src/feedback/validator';
import type { Message } from '../src/llm/base';
import { MockLLM } from '../src/llm/mock';

const DEMO_TITLE = 'Feedback loop demo: failed test to corrected action';
const FAILING_TEST_OUTPUT = [
  'FAIL src/math/add.test.ts',
  '  adds numbers',
  '    Error: expected 2 but received 3',
  '    at Object.<anonymous> (src/math/add.test.ts:7:10)',
  'Tests: 1 failed, 0 passed, 1 total',
].join('\n');

const PASSING_TEST_OUTPUT = 'Tests: 1 passed, 1 total';
const BASE_CONTEXT: Message[] = [
  { role: 'system', content: 'You are a coding agent.' },
  { role: 'user', content: 'Fix the failing test using the feedback.' },
];

async function main(): Promise<void> {
  printInitialFailure();
  const feedback = parseFeedback(FAILING_TEST_OUTPUT);
  const classified = classifyFeedback(feedback);
  printParsedFeedback(classified);

  const context = buildFeedbackContext(classified);
  printFeedbackContext(context);

  const correction = await generateCorrection(context);
  printCorrection(correction);
  printSuccess();
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
  return new FeedbackLoop().append(BASE_CONTEXT, feedback);
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

function printInitialFailure(): void {
  console.log(DEMO_TITLE);
  console.log('Initial test failure:');
  console.log(FAILING_TEST_OUTPUT);
}

function printParsedFeedback(feedback: FeedbackEntry[]): void {
  console.log(`Feedback parsed: ${feedback.length} item(s)`);
  console.log(`Failure category: ${feedback[0]?.category ?? 'unknown'}`);
  console.log(`Suggestion: ${feedback[0]?.suggestion ?? 'No suggestion.'}`);
}

function printFeedbackContext(context: Message[]): void {
  console.log('Agent received feedback context:');
  console.log(context.map((message) => message.content).join('\n'));
}

function printCorrection(correction: Awaited<ReturnType<typeof generateCorrection>>): void {
  console.log(`Correction action: ${correction.type}`);
  console.log(`Correction detail: ${JSON.stringify(correction.parameters)}`);
}

function printSuccess(): void {
  console.log('Corrected test result:');
  console.log(PASSING_TEST_OUTPUT);
  console.log('Feedback loop success: tests passed after correction.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
