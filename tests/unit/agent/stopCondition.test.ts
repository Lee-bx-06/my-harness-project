import assert from 'node:assert/strict';
import test from 'node:test';
import { StopCondition } from '../../../src/agent/stopCondition';

type StopReason = 'max-iterations' | 'user-aborted' | 'task-complete' | 'consecutive-failures';

type StopState = {
  iteration: number;
  userAborted?: boolean;
  taskComplete?: boolean;
  consecutiveFailures?: number;
};

type StopResult = {
  shouldStop: boolean;
  reason?: StopReason;
  message?: string;
};

type StopConditionLike = {
  evaluate?: (state: StopState) => StopResult;
  shouldStop?: (state: StopState) => StopResult;
  check?: (state: StopState) => StopResult;
};

function getStopCondition(options: Record<string, unknown> = {}): StopConditionLike {
  return new StopCondition(options) as unknown as StopConditionLike;
}

function evaluate(condition: StopConditionLike, state: StopState): StopResult {
  const method = condition.evaluate ?? condition.shouldStop ?? condition.check;
  assert.ok(method, 'Expected StopCondition to expose evaluate, shouldStop, or check.');
  return method.call(condition, state);
}

function assertStop(result: StopResult, reason: StopReason): void {
  assert.equal(result.shouldStop, true);
  assert.equal(result.reason, reason);
  assert.equal(typeof result.message, 'string');
  assert.notEqual(result.message?.trim(), '');
}

test('StopCondition continues while no configured stop condition is met', () => {
  const condition = getStopCondition({
    maxIterations: 5,
    maxConsecutiveFailures: 3,
  });

  assert.deepEqual(
    evaluate(condition, {
      iteration: 2,
      consecutiveFailures: 1,
      userAborted: false,
      taskComplete: false,
    }),
    { shouldStop: false },
  );
});

test('StopCondition stops when the maximum iteration count is reached', () => {
  const condition = getStopCondition({ maxIterations: 3 });

  assertStop(evaluate(condition, { iteration: 3 }), 'max-iterations');
  assertStop(evaluate(condition, { iteration: 4 }), 'max-iterations');
});

test('StopCondition stops when the user aborts the run', () => {
  const condition = getStopCondition();

  assertStop(evaluate(condition, { iteration: 1, userAborted: true }), 'user-aborted');
});

test('StopCondition stops when the task is marked complete', () => {
  const condition = getStopCondition();

  assertStop(evaluate(condition, { iteration: 1, taskComplete: true }), 'task-complete');
});

test('StopCondition stops after the configured number of consecutive failures', () => {
  const condition = getStopCondition({ maxConsecutiveFailures: 2 });

  assert.deepEqual(evaluate(condition, { iteration: 2, consecutiveFailures: 1 }), {
    shouldStop: false,
  });
  assertStop(evaluate(condition, { iteration: 3, consecutiveFailures: 2 }), 'consecutive-failures');
});
